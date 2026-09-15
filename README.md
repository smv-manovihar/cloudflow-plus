# CloudFlow+ ☁️

**Modern, secure file management and hybrid cloud sharing platform.**

CloudFlow+ is a self-hosted web application for organizing, synchronizing, and securely sharing files across local and cloud storage providers. It connects directly to any S3-compatible object storage (including MinIO, AWS S3, Cloudflare R2, Google Cloud Storage, Wasabi, and Backblaze B2) to give you full ownership of your data with a modern cloud drive experience.

---

## ✨ Features

### 📁 File & Folder Management
- **Folder Organization**: Create, navigate, and organize nested folders with intuitive breadcrumb navigation.
- **Drag-and-Drop Uploads**: Upload single or multiple files simultaneously with instant progress tracking.
- **File Previews & Streaming**: View images, PDFs, text documents, and stream video/audio files directly in your browser without downloading first.
- **Search & Filtering**: Search files across your entire storage or filter within specific folders.
- **Auto-Navigation**: Automatically navigates to newly created folders for a smooth workflow.

### 🔗 Secure File Sharing
- **Expiring Links**: Generate share links with customizable expiration times (1 hour, 1 day, 7 days, 30 days, or custom dates).
- **Password Protection**: Restrict file access with password protection and built-in rate limiting against brute-force attempts.
- **QR Code Sharing**: Instantly generate and download scannable QR codes for quick mobile access.
- **Public Download Page**: Clean, branded landing page where recipients can preview file details and securely download the file.
- **Centralized Share Dashboard**: View all generated links, monitor expiration status, update passwords or time limits, toggle links on/off, or revoke access at any time.

### 🔄 Hybrid Cloud Backup & Synchronization
- **Primary-to-Cloud Sync**: Keep your primary local storage (e.g., local MinIO) backed up to a secondary cloud provider (e.g., AWS S3 or Cloudflare R2).
- **Automatic & On-Demand Sync**: Enable automated sync on your account or trigger manual full-sync jobs whenever needed.
- **Single-File Sync**: Immediately sync individual files with one click.
- **Granular Deletion**: Choose to delete files from local storage only, remove the backup from cloud storage, or delete from both simultaneously.
- **Status Indicators**: Clear visual indicators show whether each file is synced, pending, or local-only.

### 🛡️ Administration & Platform Controls
- **Admin Dashboard**: Dedicated administration interface to monitor connected storage buckets and platform settings.
- **Platform Sync Policy**: Admins can toggle backup sync functionality platform-wide.
- **Share Source Routing**: Configure whether shareable links serve files directly from primary storage or secondary cloud backup.
- **Role-Based Permissions**: Distinct access levels for standard users and platform administrators.
- **User Account Management**: Manage profiles, change passwords securely, or delete accounts with full data cleanup.

### 🎨 User Interface
- **Dark & Light Mode**: Built-in theme switching tailored for day and night use.
- **Responsive Design**: Works seamlessly across desktops, tablets, and mobile devices.
- **Instant Notifications**: Real-time toast feedback for uploads, share updates, and sync operations.

---

## ⚠️ Limitations & Considerations

- **Platform-Managed Storage**: Storage credentials (S3 endpoints, access keys, and bucket names) are configured at the server level by the administrator. Users upload to their own isolated workspace within the configured storage rather than supplying individual storage keys.
- **One-Way Backup Sync**: Synchronization operates in one direction: from the primary storage provider to the secondary cloud backup target.
- **Browser Media Support**: In-browser previews and streaming rely on standard web media formats supported by your browser (e.g., MP4, WebM, PNG, JPG, PDF, TXT).
- **Storage Provider Limits**: Maximum upload sizes and presigned link download speeds are subject to your configured storage provider's quotas and network bandwidth.
- **Single Primary Bucket**: The application connects to a primary storage bucket for all active user workspaces, with an optional secondary bucket for cloud backups.

---

## 🛠️ Tech Stack

| Component | Technology |
| :--- | :--- |
| **Frontend** | Next.js (App Router), React, TypeScript, Tailwind CSS, Radix UI, Lucide Icons, Sonner |
| **Backend** | FastAPI, Python 3.11+, SQLAlchemy, Pydantic, Boto3, Uvicorn |
| **Storage** | Any S3-compatible service (MinIO, AWS S3, Cloudflare R2, Wasabi, Backblaze B2, GCS) |
| **Database** | SQLite (default for development) / PostgreSQL (production) |

---

## 🚀 How to Setup the App

Follow these steps to run CloudFlow+ locally on your machine.

### Prerequisites

- **Node.js** (v18 or higher) and `npm`
- **Python** (v3.11 or higher)
- **[uv](https://github.com/astral-sh/uv)** (Fast Python package manager)
  ```bash
  pip install uv
  ```
- **MinIO** (for local S3 storage) or active credentials for AWS S3 / Cloudflare R2.

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/smv-manovihar/cloudflow-plus.git
cd cloudflow-plus
```

---

### Step 2: Start Local Storage (MinIO)

If you are developing locally without an external cloud bucket, start MinIO:

**Using Docker:**
```bash
docker run -d -p 9000:9000 -p 9090:9090 --name minio-server \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  -v minio_data:/data \
  minio/minio server /data --console-address ":9090"
```

**Using the Standalone MinIO Binary (Windows):**
```powershell
.\minio.exe server .\minio-data --address ":9000" --console-address ":9090"
```

> **Tip**: Access the MinIO web console at `http://localhost:9090` (login: `minioadmin` / `minioadmin`) and ensure the bucket `cloud-flow-bucket` exists (create it if not already present).

---

### Step 3: Configure & Start the Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install Python dependencies:
   ```bash
   uv sync
   ```

3. Create your environment configuration:
   ```bash
   cp .env.example .env
   ```

4. Verify settings in `backend/.env` (default settings work out-of-the-box with local MinIO):
   ```env
   FRONTEND_URL=http://localhost:3000
   DATABASE_URL=sqlite:///database/cloudflow.db

   PRIMARY_STORAGE_ENDPOINT=http://localhost:9000
   PRIMARY_STORAGE_ACCESS_KEY=minioadmin
   PRIMARY_STORAGE_SECRET_KEY=minioadmin
   PRIMARY_STORAGE_BUCKET=cloud-flow-bucket
   PRIMARY_STORAGE_REGION=us-east-1
   ```

5. Start the backend API server:
   ```bash
   uv run uvicorn app.main:app --reload --port 8000
   ```

   The API will be running at `http://localhost:8000`.
   - API Docs: `http://localhost:8000/docs`

---

### Step 4: Configure & Start the Frontend

1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Create the frontend environment configuration:
   ```bash
   cp .env.example .env
   ```
   *Ensure the following values are set:*
   ```env
   NEXT_PUBLIC_API_URL="http://localhost:8000"
   NEXT_PUBLIC_FRONTEND_URL="http://localhost:3000"
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### Step 5: Administrator Account Setup

On its first launch, CloudFlow+ automatically provisions an administrator account and prints the generated credentials in the backend terminal console.

You can also use the CLI provisioning script in `backend/` for different setup scenarios:

```bash
cd backend
```

**Scenario 1: First-Time Setup (Recommended)**
Provide your admin email. The script automatically generates a strong random password, displays it in your terminal, saves it to your `backend/.env`, and creates/syncs the admin user in the database:
```bash
uv run python scripts/set_admin_credentials.py admin@cloudflow.local
```

**Scenario 2: Set a Custom Password**
If you prefer to define your own administrator password:
```bash
uv run python scripts/set_admin_credentials.py admin@cloudflow.local --password "YourStrongPassword123!"
```

**Scenario 3: Force Reset an Existing Password**
If you are locked out and need the server to forcefully override the stored password on next startup:
```bash
uv run python scripts/set_admin_credentials.py admin@cloudflow.local --force-reset
```

**Scenario 4: Generate Production Environment Snippet**
Output pre-hashed credentials ready to copy into your production environment variables:
```bash
uv run python scripts/set_admin_credentials.py admin@cloudflow.local --generate-prod
```

Once configured, log in with your administrator credentials and open `/admin` to manage platform settings.

---

## ⚙️ Configuration Reference

### Backend Settings (`backend/.env`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `FRONTEND_URL` | Allowed origin for frontend requests | `http://localhost:3000` |
| `DATABASE_URL` | SQLite or PostgreSQL connection string | `sqlite:///database/cloudflow.db` |
| `PRIMARY_STORAGE_ENDPOINT` | Endpoint URL for primary S3/MinIO service | `http://localhost:9000` |
| `PRIMARY_STORAGE_ACCESS_KEY` | Storage Access Key ID | `minioadmin` |
| `PRIMARY_STORAGE_SECRET_KEY` | Storage Secret Access Key | `minioadmin` |
| `PRIMARY_STORAGE_BUCKET` | Primary storage bucket name | `cloud-flow-bucket` |
| `PRIMARY_STORAGE_REGION` | Primary storage region | `us-east-1` |
| `SYNC_TARGET_ENDPOINT` | *(Optional)* Endpoint for secondary cloud backup | *None* |
| `SYNC_TARGET_ACCESS_KEY` | *(Optional)* Access Key for secondary backup | *None* |
| `SYNC_TARGET_SECRET_KEY` | *(Optional)* Secret Key for secondary backup | *None* |
| `SYNC_TARGET_BUCKET` | *(Optional)* Bucket name for secondary backup | *None* |
| `SYNC_TARGET_REGION` | *(Optional)* Region for secondary backup bucket | `us-east-1` |

### Frontend Settings (`frontend/.env`)

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | URL of the backend API service | `http://localhost:8000` |
| `NEXT_PUBLIC_FRONTEND_URL` | URL of the frontend application | `http://localhost:3000` |

---

## 🤝 Contributing

Contributions, feedback, and bug reports are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/NewFeature`)
3. Commit your changes (`git commit -m 'Add NewFeature'`)
4. Push to the branch (`git push origin feature/NewFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License. See `LICENSE` for details.
