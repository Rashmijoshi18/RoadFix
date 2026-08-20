/**
 * RoadFix — AI Routes (Gemini Vision API)
 * Gracefully degrades if GEMINI_API_KEY is not set.
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getCollection } = require('../db/mongoClient');
const logger = require('../middleware/logger');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// ─── POST /api/ai/verify-image ────────────────────────────────────────────────
router.post('/verify-image', authenticateToken, async (req, res, next) => {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64) {
        return res.status(400).json({ success: false, error: 'Image data required' });
    }

    // Graceful degradation if no API key
    if (!GEMINI_API_KEY) {
        logger.warn('AI verify-image called but GEMINI_API_KEY not set — returning fallback');
        return res.json({
            success: true,
            data: {
                isRoadIssue: true,
                category: null,
                severity: 'Medium',
                confidence: 0,
                description: 'AI analysis unavailable. Manual review will be performed.',
                aiAvailable: false
            }
        });
    }

    try {
        const prompt = `Analyze this image and determine if it shows a road or public infrastructure issue.
Return a JSON object with these exact keys:
{
  "isRoadIssue": boolean,
  "category": "Pothole" | "Blocked Drain" | "Streetlight Issue" | "Faded Road Signs" | "Road Damage" | "Encroachment" | "Other" | null,
  "severity": "Low" | "Medium" | "High" | "Critical",
  "confidence": number between 0 and 100,
  "description": "one-sentence description of what you see",
  "rejectionReason": "why rejected if not a road issue" | null
}

Rules:
- isRoadIssue must be true ONLY if the image clearly shows a road, footpath, drain, streetlight, or public infrastructure problem.
- If the image is unclear, irrelevant (people, food, documents, etc.), set isRoadIssue to false.
- severity: Critical = immediate danger, High = major problem, Medium = moderate, Low = cosmetic.
Respond with ONLY the JSON object, no markdown.`;

        const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: mimeType || 'image/jpeg', data: imageBase64 } }
                    ]
                }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
            })
        });

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const geminiData = await response.json();
        const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

        let analysis;
        try {
            analysis = JSON.parse(rawText);
        } catch {
            analysis = { isRoadIssue: true, category: null, severity: 'Medium', confidence: 50, description: 'Could not parse AI response' };
        }

        logger.info(`AI image analysis: isRoadIssue=${analysis.isRoadIssue}, severity=${analysis.severity}`);

        res.json({ success: true, data: { ...analysis, aiAvailable: true } });
    } catch (err) {
        logger.error(`AI verify-image error: ${err.message}`);
        // Graceful fallback on API error
        res.json({
            success: true,
            data: {
                isRoadIssue: true,
                category: null,
                severity: 'Medium',
                confidence: 0,
                description: 'AI analysis temporarily unavailable.',
                aiAvailable: false,
                error: err.message
            }
        });
    }
});

// ─── POST /api/ai/check-duplicate ────────────────────────────────────────────
router.post('/check-duplicate', authenticateToken, async (req, res, next) => {
    const { latitude, longitude, title, description, category } = req.body;

    if (!latitude || !longitude) {
        return res.status(400).json({ success: false, error: 'Location required for duplicate check' });
    }

    try {
        const reports = await getCollection('reports');
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        // Geo-radius query: ~100 meters (0.001 degree ≈ 111 meters)
        const RADIUS = 0.001;
        const nearby = await reports.find({
            status: { $nin: ['Closed'] },
            latitude: { $gte: lat - RADIUS, $lte: lat + RADIUS },
            longitude: { $gte: lng - RADIUS, $lte: lng + RADIUS }
        }).limit(10).toArray();

        if (nearby.length === 0) {
            return res.json({ success: true, data: { isDuplicate: false, similar: [] } });
        }

        // Check title similarity (simple overlap scoring)
        const queryWords = new Set([
            ...(title || '').toLowerCase().split(/\s+/),
            ...(description || '').toLowerCase().split(/\s+/)
        ]);

        const similar = nearby
            .map(r => {
                const targetWords = new Set([
                    ...(r.title || '').toLowerCase().split(/\s+/),
                    ...(r.description || '').toLowerCase().split(/\s+/)
                ]);
                const intersection = [...queryWords].filter(w => targetWords.has(w) && w.length > 3);
                const similarity = queryWords.size > 0 ? Math.round((intersection.length / queryWords.size) * 100) : 0;
                const distLat = Math.abs(lat - (r.latitude || 0));
                const distLng = Math.abs(lng - (r.longitude || 0));
                const distMeters = Math.round(Math.sqrt(distLat ** 2 + distLng ** 2) * 111000);
                return { ...r, _id: undefined, id: r._id?.toString(), similarity, distanceMeters: distMeters };
            })
            .filter(r => r.similarity > 20 || r.distanceMeters < 50)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 5);

        const isDuplicate = similar.some(r => r.similarity > 50 || r.distanceMeters < 30);

        res.json({ success: true, data: { isDuplicate, similar } });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
