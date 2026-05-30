# Use the official Python lightweight runtime
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Set working directory
WORKDIR /app

# Install system dependencies needed by python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy python dependencies list and install them
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code files into the container
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Expose port 8080
EXPOSE 8080

# Configure Python path so modules import correctly from subfolders
ENV PYTHONPATH=/app/backend

# Start FastAPI application, binding to the port provided by Cloud Run
CMD uvicorn backend.app:app --host 0.0.0.0 --port $PORT
