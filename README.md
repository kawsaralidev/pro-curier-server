# 🚀 Pro Courier Server

<p align="center">

![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-5-000000?style=for-the-badge&logo=express)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Firebase Admin](https://img.shields.io/badge/Firebase_Admin-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Stripe](https://img.shields.io/badge/Stripe-635BFF?style=for-the-badge&logo=stripe)
![REST API](https://img.shields.io/badge/API-REST-success?style=for-the-badge)

</p>

The backend service for **Pro Courier**, built with **Node.js**, **Express.js**, and **MongoDB**. This server powers authentication, parcel management, rider operations, payment processing, shipment tracking, and role-based access control through secure RESTful APIs.

---

# 📸 API Overview

The server provides secure REST APIs for the Pro Courier client application. It handles authentication, parcel booking, rider assignment, delivery tracking, payment processing, and administrative operations while ensuring secure communication with the database.

---

# 🚀 Project Overview

Pro Courier Server is designed to manage every stage of the parcel delivery lifecycle. From user registration and authentication to parcel booking, rider assignment, payment verification, tracking updates, and administrative control, the backend ensures efficient business logic and secure data management.

---

# 🎯 Goal

Build a secure, scalable, and maintainable backend that automates courier operations and provides reliable RESTful APIs for customers, riders, and administrators.

---

# ✨ Core Features

## 👤 User Management

- User Registration
- User Search
- Role Management
- Role-Based Authorization
- Secure Authentication

---

## 📦 Parcel Management

- Create Parcel
- Update Parcel Status
- Delete Parcel
- Parcel History
- Delivery Status Filtering
- Parcel Analytics

---

## 🛵 Rider Management

- Rider Registration
- Rider Approval
- Rider Assignment
- Available Rider Search
- Rider Delivery Tasks
- Completed Deliveries
- Rider Cashout

---

## 📍 Parcel Tracking

- Tracking Timeline
- Tracking History
- Tracking Status Update
- Public Parcel Tracking

---

## 💳 Payment System

- Stripe Payment Integration
- Payment Intent Creation
- Payment History
- Payment Verification
- Secure Transaction Storage

---

## 👨‍💼 Admin Operations

- Manage Users
- Manage Riders
- Assign Riders
- Delivery Monitoring
- Parcel Statistics
- Dashboard Analytics

---

# 🛠️ Technology Stack

### Backend

- Node.js
- Express.js

### Database

- MongoDB (Native Driver)

### Authentication

- Firebase Admin SDK
- Firebase ID Token Verification
- JWT Authorization

### Payment Gateway

- Stripe

### Deployment

- Serverless HTTP

### Utilities

- Dotenv
- CORS

---

# 📦 Dependencies

- Express.js
- MongoDB
- Firebase Admin SDK
- Stripe
- Dotenv
- CORS
- Serverless HTTP

---

# ⚙️ Installation & Setup

## Clone Repository

```bash
git clone <https://github.com/kawsaralidev/pro-curier-server.git>
```

## Navigate to Project

```bash
cd pro-curier-server
```

## Install Dependencies

```bash
npm install
```

## Configure Environment Variables

Create a `.env` file in the root directory.

```env
PORT=

DB_USER=

DB_PASS=

PAYMENT_GETWAY_KEY=

FB_SERVICE_KEY=
```

## Run Development Server

```bash
npm run dev
```

## Run Production Server

```bash
npm start
```

---

# 📡 API Modules

### Authentication

- Firebase Authentication
- Token Verification
- Role Verification

### Users

- User Registration
- User Search
- User Role Update

### Parcels

- Create Parcel
- Update Parcel
- Delete Parcel
- Parcel Statistics
- Delivery Status Management

### Riders

- Rider Registration
- Rider Approval
- Rider Assignment
- Rider Dashboard
- Cashout System

### Payments

- Create Payment Intent
- Stripe Payment
- Payment History

### Tracking

- Create Tracking Log
- Parcel Tracking Timeline
- Delivery Status Updates

---

# 🔐 Authentication & Security

- Firebase Admin Authentication
- JWT-Based Authorization
- Protected API Routes
- Role-Based Access Control
- Secure Environment Variables
- CORS Protection
- Stripe Secure Payment Processing

---

# 👨‍💻 Developer

**Kawsar Ali**
