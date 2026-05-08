// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();
const stripeSecretKey = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.trim();
const stripe = require('stripe')(stripeSecretKey);

if (!stripeSecretKey) {
    console.warn('⚠️ STRIPE_SECRET_KEY is not set. Payments will fail until the key is configured.');
}

const app = express();
const PORT = process.env.PORT || 5000;

// ========================================
// MIDDLEWARE
// ========================================
app.use(cors());
app.use(express.json({ limit: '10mb' })); // To handle larger payloads (e.g., trainer profile images)
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // For form data

// Serve frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// ========================================
// MONGODB CONNECTION
// ========================================
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db('fitzone_db');
        console.log('✅ Connected to MongoDB Atlas');
        console.log('   Database: fitzone_db');

        const classCount = await db.collection('classes').countDocuments();
        console.log(`   📊 Classes in database: ${classCount}`);
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
    }
}

function getDatabase() {
    return db;
}


// USER AUTHENTICATION ROUTES


// Register a new user (member or trainer)
app.post('/api/register', async (req, res) => {
    try {
        const {
            name, email, password, role,
            specialty, experience, bio, certifications, profileImage
        } = req.body;

        // Validation
        if (!name || !email || !password || !role) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        if (role !== 'member' && role !== 'trainer') {
            return res.status(400).json({ error: 'Role must be member or trainer' });
        }

        const db = getDatabase();
        const users = db.collection('users');

        // Check if email already exists
        const existing = await users.findOne({ email });
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        // Build user object
        const newUser = {
            name,
            email,
            password,
            role,
            createdAt: new Date(),
            assignedClasses: []
        };

        // Add trainer-specific fields
        if (role === 'trainer') {
            newUser.specialty = specialty || 'Fitness Trainer';
            newUser.experience = experience || '0+ years';
            newUser.bio = bio || 'Passionate about helping you achieve your fitness goals.';
            newUser.certifications = certifications || 'Certified Personal Trainer';
            newUser.profileImage = profileImage || null;
            newUser.isProfileComplete = false;
        }

        const userResult = await users.insertOne(newUser);
        const newUserId = userResult.insertedId;

        // If trainer, create a default class for them
        let createdClassId = null;
        if (role === 'trainer') {
            // Set default class details
            const today = new Date();
            const defaultDate = today.toISOString().split('T')[0];
            const defaultTime = '09:00';

            const newClass = {
                name: `${name}'s Class`,
                instructor: name,
                date: defaultDate,
                time: defaultTime,
                duration: 60,
                location: 'Main Gym',
                difficulty: 'intermediate',
                maxCapacity: 20,
                booked: 0,
                description: bio || `Join ${name} for an exciting fitness session.`,
                tags: [specialty ? specialty.toLowerCase() : 'fitness'],
                status: 'active',
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const classResult = await db.collection('classes').insertOne(newClass);
            createdClassId = classResult.insertedId;

            // Assign this class to the trainer
            await users.updateOne(
                { _id: newUserId },
                { $addToSet: { assignedClasses: createdClassId } }
            );
        }

        const userWithoutPassword = { ...newUser, _id: newUserId, password: undefined };

        res.status(201).json({
            message: 'Registration successful',
            user: userWithoutPassword,
            createdClassId: createdClassId || null
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: error.message });
    }
});
// Update trainer profile (add photo, bio, etc.)
app.put('/api/trainer/:trainerId/profile', async (req, res) => {
    try {
        const { trainerId } = req.params;
        const { specialty, experience, bio, certifications, profileImage } = req.body;
        const db = getDatabase();
        const { ObjectId } = require('mongodb');

        const updateData = {
            specialty,
            experience,
            bio,
            certifications,
            profileImage,
            isProfileComplete: true,
            updatedAt: new Date()
        };

        const result = await db.collection('users').updateOne(
            { _id: new ObjectId(trainerId), role: 'trainer' },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Trainer not found' });
        }

        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get trainer profile by ID (for display on trainers page)
app.get('/api/trainer/:trainerId/profile', async (req, res) => {
    try {
        const { trainerId } = req.params;
        const db = getDatabase();
        const { ObjectId } = require('mongodb');

        const trainer = await db.collection('users').findOne(
            { _id: new ObjectId(trainerId), role: 'trainer' },
            { projection: { password: 0 } }
        );

        if (!trainer) {
            return res.status(404).json({ error: 'Trainer not found' });
        }

        res.json(trainer);
    } catch (error) {
        console.error('Error fetching trainer:', error);
        res.status(500).json({ error: error.message });
    }
});
// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const db = getDatabase();
        const user = await db.collection('users').findOne({ email, password });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const userResponse = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            assignedClasses: user.assignedClasses || []
        };

        res.json({ message: 'Login successful', user: userResponse });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get trainer's assigned classes (dashboard)
app.get('/api/trainer/:trainerId/classes', async (req, res) => {
    try {
        const db = getDatabase();
        const trainerId = req.params.trainerId;

        // Find the trainer
        const trainer = await db.collection('users').findOne({ _id: new ObjectId(trainerId), role: 'trainer' });
        if (!trainer) {
            return res.status(404).json({ error: 'Trainer not found' });
        }

        // Get class details for each assigned class ID
        const classIds = (trainer.assignedClasses || []).map(id => new ObjectId(id));
        const classes = await db.collection('classes').find({ _id: { $in: classIds } }).toArray();

        res.json(classes);
    } catch (error) {
        console.error('Error fetching trainer classes:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin: assign a class to a trainer
app.post('/api/admin/assign-trainer', async (req, res) => {
    try {
        const { classId, trainerEmail } = req.body;
        const db = getDatabase();

        // Find the trainer by email
        const trainer = await db.collection('users').findOne({ email: trainerEmail, role: 'trainer' });
        if (!trainer) {
            return res.status(404).json({ error: 'Trainer not found' });
        }

        // Add class ID to trainer's assignedClasses if not already there
        const classObjectId = new ObjectId(classId);
        const alreadyAssigned = trainer.assignedClasses?.some(id => id.toString() === classId);
        if (!alreadyAssigned) {
            await db.collection('users').updateOne(
                { _id: trainer._id },
                { $addToSet: { assignedClasses: classObjectId } }
            );
        }

        res.json({ message: 'Trainer assigned to class' });
    } catch (error) {
        console.error('Assign trainer error:', error);
        res.status(500).json({ error: error.message });
    }
});


// EXISTING CLASS ROUTES 


// Get all classes
app.get('/api/classes', async (req, res) => {
    try {
        const classes = await db.collection('classes').find({}).toArray();
        res.json(classes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add a new class (admin)
app.post('/api/admin/classes', async (req, res) => {
    try {
        const newClass = {
            ...req.body,
            booked: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        const result = await db.collection('classes').insertOne(newClass);
        res.status(201).json({ ...newClass, _id: result.insertedId });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Update a class (admin)
app.put('/api/admin/classes/:id', async (req, res) => {
    try {
        const updateData = { ...req.body, updatedAt: new Date() };
        const result = await db.collection('classes').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: updateData }
        );
        if (result.matchedCount === 0) return res.status(404).json({ error: 'Class not found' });
        res.json({ message: 'Class updated successfully' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Delete a class (admin)
app.delete('/api/admin/classes/:id', async (req, res) => {
    try {
        const result = await db.collection('classes').deleteOne({ _id: new ObjectId(req.params.id) });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Class not found' });
        res.json({ message: 'Class deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create a booking
app.post('/api/bookings', async (req, res) => {
    try {
        const { classId, userName } = req.body;
        const classItem = await db.collection('classes').findOne({ _id: new ObjectId(classId) });
        if (!classItem) return res.status(404).json({ error: 'Class not found' });
        if (classItem.booked >= classItem.maxCapacity) {
            return res.status(400).json({ error: 'Class is full' });
        }

        const booking = {
            classId: new ObjectId(classId),
            userName: userName || 'Guest User',
            className: classItem.name,
            classDate: classItem.date,
            classTime: classItem.time,
            instructor: classItem.instructor,
            location: classItem.location,
            bookedAt: new Date(),
            status: 'confirmed'
        };
        const result = await db.collection('bookings').insertOne(booking);
        await db.collection('classes').updateOne(
            { _id: new ObjectId(classId) },
            { $inc: { booked: 1 } }
        );
        res.status(201).json({ message: 'Booking successful', bookingId: result.insertedId });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get all bookings (admin)
app.get('/api/bookings', async (req, res) => {
    try {
        const bookings = await db.collection('bookings').find({}).toArray();
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get dashboard stats
app.get('/api/admin/stats', async (req, res) => {
    try {
        const totalClasses = await db.collection('classes').countDocuments();
        const totalBookings = await db.collection('bookings').countDocuments();
        const fullClasses = await db.collection('classes').countDocuments({
            $expr: { $gte: ["$booked", "$maxCapacity"] }
        });
        const allClasses = await db.collection('classes').find({}).toArray();
        const totalCapacity = allClasses.reduce((sum, c) => sum + c.maxCapacity, 0);
        const totalBooked = allClasses.reduce((sum, c) => sum + c.booked, 0);
        res.json({ totalClasses, totalBookings, fullClasses, totalCapacity, totalBooked });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// PAYMENT ROUTES

// Create payment intent
app.post('/api/create-payment-intent', async (req, res) => {
    try {
        const { amount, currency = 'gbp', planId, userDetails } = req.body;

        // Validate required fields
        if (!amount || !planId) {
            return res.status(400).json({ error: 'Amount and planId are required' });
        }

        // Convert amount to cents (Stripe expects smallest currency unit)
        const amountInCents = Math.round(parseFloat(amount.replace('£', '')) * 100);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents,
            currency: currency,
            metadata: {
                planId: planId,
                userEmail: userDetails?.email || '',
                userName: userDetails?.firstName + ' ' + userDetails?.lastName || ''
            },
            automatic_payment_methods: {
                enabled: true,
            },
        });

        res.json({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id
        });
    } catch (error) {
        console.error('Payment intent creation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Confirm payment and create membership
app.post('/api/confirm-payment', async (req, res) => {
    try {
        const { paymentIntentId, planId, userDetails } = req.body;

        if (!paymentIntentId || !planId || !userDetails) {
            return res.status(400).json({ error: 'Payment intent ID, plan ID, and user details are required' });
        }

        // Retrieve payment intent from Stripe
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== 'succeeded') {
            return res.status(400).json({ error: 'Payment not successful' });
        }

        // Store payment and membership in database
        const membership = {
            planId: planId,
            userDetails: userDetails,
            paymentIntentId: paymentIntentId,
            amount: paymentIntent.amount / 100, // Convert back to pounds
            currency: paymentIntent.currency,
            status: 'active',
            startDate: new Date(),
            createdAt: new Date()
        };

        const result = await db.collection('memberships').insertOne(membership);

        res.json({
            message: 'Payment confirmed and membership created',
            membershipId: result.insertedId,
            status: 'success'
        });
    } catch (error) {
        console.error('Payment confirmation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get user memberships
app.get('/api/memberships/:userEmail', async (req, res) => {
    try {
        const { userEmail } = req.params;
        const memberships = await db.collection('memberships').find({ 'userDetails.email': userEmail }).toArray();
        res.json(memberships);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// FRONTEND ROUTE

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});


// START SERVER

async function startServer() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`\n🚀 AuraAthletic Server running on http://localhost:${PORT}`);
        console.log(`   API: http://localhost:${PORT}/api/classes`);
        console.log(`   Auth: http://localhost:${PORT}/api/register`);
    });
}

// Get all trainers (for trainers page)
app.get('/api/trainers', async (req, res) => {
    try {
        const db = getDatabase();
        const trainers = await db.collection('users').find({ role: 'trainer' }).toArray();

        // Remove passwords from response
        const safeTrainers = trainers.map(t => {
            const { password, ...safe } = t;
            return safe;
        });

        console.log(`Sending ${safeTrainers.length} trainers`);
        res.json(safeTrainers);
    } catch (error) {
        console.error('Error fetching trainers:', error);
        res.status(500).json({ error: error.message });
    }
});

startServer();