# Sabzee Server - Farmer-to-Consumer Platform

A backend server for a farmer-centric platform that enables direct farm-to-consumer sales, eliminating middlemen and ensuring fair pricing.

## Features

- User Authentication (Farmers & Consumers)
- Product Management
- Order Processing
- Farmer Analytics
- Location-based Farmer Search
- Image Upload with Cloudinary
- Secure Payment Integration

## Tech Stack

- Node.js
- Express.js
- MongoDB
- Cloudinary (Image Storage)
- JWT Authentication

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Cloudinary Account

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd sabzee-server
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user (farmer/consumer)
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user profile

### Products
- `POST /api/products` - Create a new product (Farmer only)
- `GET /api/products` - Get all products with filters
- `GET /api/products/:id` - Get product by ID
- `PUT /api/products/:id` - Update product (Farmer only)
- `DELETE /api/products/:id` - Delete product (Farmer only)

### Orders
- `POST /api/orders` - Create a new order (Consumer only)
- `GET /api/orders` - Get all orders (filtered by role)
- `GET /api/orders/:id` - Get order by ID
- `PUT /api/orders/:id` - Update order status (Farmer only)

### Farmers
- `GET /api/farmers/me` - Get farmer profile
- `PUT /api/farmers/me` - Update farmer profile
- `GET /api/farmers/analytics` - Get farmer's analytics
- `GET /api/farmers/nearby` - Get nearby farmers

## Data Models

### User
- Name
- Email
- Password (hashed)
- Role (farmer/consumer)
- Contact Number
- Farm Details (for farmers)
  - Farm Name
  - Location (coordinates)
  - Farm Size
  - Main Crops
- Ratings & Reviews

### Product
- Name
- Description
- Category
- Price
- Unit
- Quantity
- Images
- Harvest Date
- Expiry Date
- Organic Status
- Certifications
- Status
- Ratings & Reviews

### Order
- Buyer
- Farmer
- Items
- Total Amount
- Status
- Payment Status
- Payment Method
- Shipping Address
- Delivery Date
- Tracking Number

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License. 