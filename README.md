# 🛣️ RoadFix — Citizen Road Issue Reporting Platform

> A full-stack web application that empowers citizens to report road infrastructure problems — potholes, blocked drains, broken streetlights, and more — with live map pinning, image uploads, and a real-time dashboard.

---

## ✨ Features

- 📍 **Live Map Pinning** — Click or drag a marker on an interactive Leaflet map to pinpoint the exact issue location
- 📸 **Image Upload** — Attach a photo directly from your device (up to 5MB)
- 🏷️ **Issue Categorisation** — Pothole, Blocked Drain, Streetlight Issue, Faded Road Signs, Other
- ✅ **Inline Success Banner** — After submission, an animated confirmation appears on the same page with a Tracking ID — no page switching needed
- 📊 **Live Dashboard** — View all submitted reports with status badges, filters by category & status
- 🔄 **Status Management** — Update reports from `Reported → In Progress → Resolved` with resolution notes
- 🗑️ **Delete Reports** — Permanently remove resolved or invalid reports
- 🌙 **Dark / Light Mode** — Full theme toggle with persistent preference
- 📱 **Fully Responsive** — Works seamlessly on mobile, tablet, and desktop

---

## 🗂️ Project Structure

```
project-ca/
├── backend/
│   ├── controllers/
│   │   └── reportController.js   # CRUD logic for reports
│   ├── db/
│   │   ├── mongoClient.js        # Shared MongoDB client + indexes + user seed
│   │   └── auditDatabase.js      # Audit log helper backed by MongoDB
│   ├── routes/
│   │   └── reportRoutes.js       # Express routes + Multer file upload middleware
│   ├── uploads/                  # Uploaded images stored here (git-ignored)
│   ├── server.js                 # Express app entry point
│   └── package.json
│
└── frontend/
    ├── css/
    │   └── style.css             # Full design system (light/dark, animations)
    ├── js/
    │   ├── app.js                # Report form logic, map, submission flow
    │   ├── dashboard.js          # Dashboard fetching, rendering, actions
    │   └── theme.js              # Dark/light mode toggle
    ├── index.html                # Report submission page
    └── dashboard.html            # Reports dashboard page
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v16 or higher
- npm (comes with Node.js)
- MongoDB instance (local or Atlas)

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/Rashmijoshi18/RoadFix.git
cd RoadFix
```

**2. Install backend dependencies**

```bash
cd backend
npm install
```

**3. Configure environment variables**
Create `backend/.env` with:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=roadfix
PORT=3000
```

**4. Start the server**

```bash
node server.js
```

**5. Open the app**

Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

> The frontend is served directly by the Express server — no separate frontend server needed.

---

## 🔌 API Endpoints

| Method   | Endpoint                  | Description                                                    |
| -------- | ------------------------- | -------------------------------------------------------------- |
| `GET`    | `/api/reports`            | Fetch all reports (supports `?category=` & `?status=` filters) |
| `POST`   | `/api/reports`            | Submit a new report (multipart/form-data with optional image)  |
| `PATCH`  | `/api/reports/:id/status` | Update the status of a report                                  |
| `DELETE` | `/api/reports/:id`        | Delete a report by ID                                          |
| `GET`    | `/api/reports/stats`      | Get report counts grouped by status                            |

---

## 📦 Tech Stack

| Layer            | Technology                                                            |
| ---------------- | --------------------------------------------------------------------- |
| **Frontend**     | HTML5, Vanilla CSS, Vanilla JavaScript                                |
| **Mapping**      | [Leaflet.js](https://leafletjs.com/) + OpenStreetMap                  |
| **Icons**        | [Font Awesome 6](https://fontawesome.com/)                            |
| **Fonts**        | [Outfit](https://fonts.google.com/specimen/Outfit) (Google Fonts)     |
| **Backend**      | [Node.js](https://nodejs.org/) + [Express.js](https://expressjs.com/) |
| **File Uploads** | [Multer](https://github.com/expressjs/multer)                         |
| **Data Storage** | MongoDB (`reports`, `audit_logs`, `users`, `contact_messages`)        |

---

## 🖼️ Screenshots

### Report an Issue

- Fill in the issue title, category, description, and nearest address
- Attach a photo from your device
- Click on the interactive map to pin the exact location
- Submit — an animated success banner appears instantly with your Tracking ID

### Dashboard

- See all submitted reports as cards with status badges
- Filter by category or status
- Update report status or delete reports inline

---

## 📁 Environment & Configuration

Create `backend/.env` and configure:

```bash
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=roadfix
PORT=3000
```

If `MONGODB_URI` or `MONGODB_DB_NAME` are omitted, defaults are used:

- `MONGODB_URI`: `mongodb://127.0.0.1:27017`
- `MONGODB_DB_NAME`: `roadfix`

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feat/your-feature`
5. Open a Pull Request

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

## 👩‍💻 Author

**Rashmi Joshi**

- GitHub: [@Rashmijoshi18](https://github.com/Rashmijoshi18)

---

> _RoadFix — Making roads safer, one report at a time._ 🛣️
