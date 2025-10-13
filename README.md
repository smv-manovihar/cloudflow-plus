# CloudFlow+ ☁️

**Secure file sharing with hybrid cloud support.**

CloudFlow+ is a modern file sharing web application that provides a seamless experience for managing files on both a local S3-compatible server (MinIO) and a production cloud environment (AWS S3). It features a unique **Smart Sync** capability to keep your local and cloud storage synchronized, along with robust, secure sharing options.

## ✨ Core Features

- **Hybrid Cloud Storage:** Upload and manage files on a local MinIO server for development and staging, or on AWS S3 for production.
- **Smart Sync:** Periodically or manually synchronize file objects from your local MinIO instance to your AWS S3 bucket, ensuring your data is backed up and consistent.
- **Secure Sharing Links:** Generate shareable links for your files with advanced security controls:
  - **Link Expiration:** Set an expiration date and time for links to automatically become invalid.
  - **Password Protection:** Secure your shared files with a password.
  - **QR Code Sharing:** Instantly generate a QR code for easy sharing to mobile devices.
- **Modern UI:** A clean, responsive, and user-friendly interface built with React.
- **High-Performance Backend:** A fast and reliable backend powered by FastAPI.

## 🛠️ Tech Stack

| Component         | Technology                    |
| :---------------- | :---------------------------- |
| **Frontend**      | React, Tailwind CSS, Axios    |
| **Backend**       | FastAPI, Pydantic, SQLAlchemy |
| **Cloud Storage** | AWS S3                        |
| **Local Storage** | MinIO (S3-Compatible)         |
| **Database**      | SQLite                        |

## 🚀 Getting Started

Follow these instructions to get a local copy of CloudFlow+ up and running on your machine for development and testing purposes.

### Prerequisites

- [Node.js](https://nodejs.org/en/) (v18.x or later)
- [Python](https://www.python.org/downloads/) (v3.9 or later)
- [Docker](https://www.docker.com/products/docker-desktop/)
- **[uv](https://github.com/astral-sh/uv)**: An extremely fast Python package installer. Install it via pip:
  ```bash
  pip install uv
  ```

### 1. Clone the Repository

```bash
git clone [https://github.com/your-username/cloudflow-plus.git](https://github.com/your-username/cloudflow-plus.git)
cd cloudflow-plus
```

### 2\. Configure the Backend

Navigate to the backend directory and set up your Python virtual environment and dependencies using `uv`.

```bash
cd backend
# Install dependencies from pyproject.toml
uv sync
```

After setup, create a `.env` file from the example and fill in your configuration details:

**Your `.env` file should look like this:**

```env
# AWS S3 Credentials
AWS_ACCESS_KEY_ID="YOUR_AWS_ACCESS_KEY_ID"
AWS_SECRET_ACCESS_KEY="YOUR_AWS_SECRET_ACCESS_KEY"
AWS_REGION="your-aws-region"

# MinIO Credentials
MINIO_ENDPOINT="localhost:9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
```

### 3\. Configure the Frontend

In a new terminal, navigate to the frontend directory and install the required packages.

```bash
cd frontend
npm install
```

### 4\. Run the Application

You will need three separate terminals to run all the services.

**Terminal 1: Start the Local S3 Server (MinIO)**

Run the following Docker command from the root directory of the project.

```bash
docker run -p 9000:9000 -p 9090:9090 --name minio-server \
  -e "MINIO_ROOT_USER=minioadmin" \
  -e "MINIO_ROOT_PASSWORD=minioadmin" \
  minio/minio server /data --console-address ":9090"
```

This will start MinIO. The S3-compatible server is at `http://localhost:9000` and the web console is at `http://localhost:9090`.

**Terminal 2: Start the Backend Server (FastAPI)**

Before running, make sure to activate the virtual environment if you are in a new terminal session.

```bash
# In the /backend directory
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`.

📄 Check out the API routes documentation at `http://localhost:8000/docs`.

**Terminal 3: Start the Frontend Development Server (React)**

```bash
# In the /frontend directory
npm run dev
```

The React app will open automatically in your browser at `http://localhost:5173`. You should now have a fully functional local instance of CloudFlow+\!

## 💡 Usage

1.  **Upload Files:** Drag and drop files onto the main dashboard or use the upload button. Files will be uploaded to your configured MinIO server.
2.  **Smart Sync:** Navigate to the 'Sync' page. You can trigger a manual sync to push all new objects from MinIO to your AWS S3 bucket or configure a periodic sync job.
3.  **Share a File:**
    - Click the 'Share' icon next to any file.
    - In the modal, set an optional password and an expiration date.
    - Click 'Generate Link'.
    - Copy the link, or download the QR code to share it.

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request
