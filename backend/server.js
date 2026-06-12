// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const stripeSecretKey = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.trim();
const stripe = require('stripe')(stripeSecretKey);
const { getAllPlans, getPlan, validatePlanAmount } = require('./plans');
const {
    expireActiveMemberships,
    createMembershipFromPaymentIntent,
    startMembershipExpiryJob,
    listMembershipsByEmail,
    assertMemberAccountForCheckout,
    isMembershipActive,
    normalizeEmail,
    adminUpdateMembershipStatus
} = require('./membership');
const { processStripeEvent, buildPaymentIntentMetadata } = require('./stripe-webhooks');
const { getStripeReceiptUrl, listBillingHistoryByEmail } = require('./billing-history');
const { notifyPaymentConfirmation } = require('./payment-email');
const {
    validateShopCart,
    validateFulfillment,
    buildShopPaymentMetadata,
    createShopOrderFromPayment
} = require('./shop-orders');
const { PICKUP_LOCATIONS } = require('./shop-catalog');

if (!stripeSecretKey) {
    console.warn('⚠️ STRIPE_SECRET_KEY is not set. Payments will fail until the key is configured.');
}
function getStripePublishableKey() {
    require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
    const key = process.env.STRIPE_PUBLISHABLE_KEY && process.env.STRIPE_PUBLISHABLE_KEY.trim();
    return key && key.startsWith('pk_') ? key : '';
}

const stripePublishableKey = getStripePublishableKey();
if (!stripePublishableKey) {
    console.warn('⚠️ STRIPE_PUBLISHABLE_KEY is not set. Checkout card form will not load.');
} else {
    console.log('   Stripe publishable key loaded (checkout ready)');
    if (stripeSecretKey && stripeSecretKey.startsWith('sk_')) {
        const pubMode = stripePublishableKey.startsWith('pk_live') ? 'live' : 'test';
        const secMode = stripeSecretKey.startsWith('sk_live') ? 'live' : 'test';
        if (pubMode !== secMode) {
            console.warn(`⚠️ Stripe key mismatch: secret is ${secMode}, publishable is ${pubMode}`);
        }
    }
}

const app = express();
// Default 5001: macOS often binds AirPlay Receiver to 5000, which can return HTTP 403 for http://localhost:5000
const PORT = process.env.PORT || 5001;

// ========================================
// MIDDLEWARE
// ========================================
app.use(cors());

// MB-15: Stripe webhook must use raw body (before express.json)
app.post(
    '/api/stripe/webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_WEBHOOK_SECRET.trim();
        if (!webhookSecret) {
            console.error('MB-15: STRIPE_WEBHOOK_SECRET not set');
            return res.status(503).send('Webhook secret not configured');
        }
        if (!stripeSecretKey) {
            return res.status(503).send('Stripe not configured');
        }

        const signature = req.headers['stripe-signature'];
        let event;
        try {
            event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
        } catch (err) {
            console.error('MB-15: Webhook signature verification failed:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        try {
            const db = getDatabase();
            const result = await processStripeEvent(db, event, stripe);
            res.json({ received: true, ...result });
        } catch (err) {
            console.error('MB-15: Webhook handler error:', err);
            res.status(500).json({ error: err.message });
        }
    }
);

app.use(express.json({ limit: '10mb' })); // To handle larger payloads (e.g., trainer profile images)
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // For form data

// Serve frontend files (repo root /frontend — sibling of /backend on Render)
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));

// ========================================
// MONGODB CONNECTION
// ========================================
const uri = process.env.MONGODB_URI && String(process.env.MONGODB_URI).trim();
let client = null;
let db;

async function connectDB() {
    if (!uri) {
        console.warn('⚠️ MONGODB_URI not set — site will load but login/API need a database');
        return;
    }
    try {
        client = new MongoClient(uri);
        await client.connect();
        db = client.db('fitzone_db');
        console.log('✅ Connected to MongoDB Atlas');
        console.log('   Database: fitzone_db');

        const classCount = await db.collection('classes').countDocuments();
        console.log(`   📊 Classes in database: ${classCount}`);

        // Seed initial classes if database is empty
        if (classCount === 0) {
            const today = new Date().toISOString().split('T')[0];
            const sampleClasses = [
                {
                    name: "Morning Yoga Flow",
                    instructor: "Sarah Johnson",
                    date: today,
                    time: "07:00",
                    duration: 60,
                    location: "Studio A",
                    difficulty: "beginner",
                    maxCapacity: 20,
                    booked: 0,
                    description: "Start your day with a peaceful Vinyasa flow.",
                    tags: ["yoga", "flexibility"],
                    status: "active"
                },
                {
                    name: "HIIT Intensity",
                    instructor: "Mike Chen",
                    date: today,
                    time: "18:30",
                    duration: 45,
                    location: "Main Gym",
                    difficulty: "advanced",
                    maxCapacity: 15,
                    booked: 5,
                    description: "High intensity interval training to push your limits.",
                    tags: ["cardio", "strength"],
                    status: "active"
                }
            ];
            await db.collection('classes').insertMany(sampleClasses);
            console.log('   ✅ Seeded sample classes');
        }

        // MB-8-T1: indexes for memberships collection
        await db.collection('memberships').createIndex({ 'userDetails.email': 1 });
        await db.collection('memberships').createIndex({ status: 1, endDate: 1 });
        await db.collection('memberships').createIndex({ paymentIntentId: 1 }, { unique: true, sparse: true });
        await db.collection('stripe_events').createIndex({ eventId: 1 }, { unique: true });
        await db.collection('billing_events').createIndex({ createdAt: -1 });
        await db.collection('shop_orders').createIndex({ paymentIntentId: 1 }, { unique: true });
        await db.collection('shop_orders').createIndex({ 'fulfillment.contact.email': 1, createdAt: -1 });

        // MB-10: expire overdue memberships on startup
        await expireActiveMemberships(db);
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
        const db = getDatabase();
        const classes = await db.collection('classes').find({}).toArray();
        res.json(classes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add a new class (admin)
app.post('/api/admin/classes', async (req, res) => {
    try {
        const db = getDatabase();
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
        const db = getDatabase();
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
        const db = getDatabase();
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
        const db = getDatabase();
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
        const db = getDatabase();
        const bookings = await db.collection('bookings').find({}).toArray();
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get dashboard stats
app.get('/api/admin/stats', async (req, res) => {
    try {
        const db = getDatabase();
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


// MEMBERSHIP & BILLING (Jira Epic 1–7)

// Health check for Render / uptime monitors
app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        service: 'aura-athletic',
        database: db ? 'connected' : 'disconnected'
    });
});

// MB-3-T2: plan catalog
app.get('/api/plans', (req, res) => {
    res.json(getAllPlans());
});

// MB-7: Stripe publishable key from env (never commit secret key to frontend)
app.get('/api/config/stripe', (req, res) => {
    const publishableKey = getStripePublishableKey();
    if (!publishableKey || !publishableKey.startsWith('pk_')) {
        return res.status(503).json({
            error: 'STRIPE_PUBLISHABLE_KEY not configured',
            hint: 'Add pk_test_... to backend/.env and restart the server (nodemon: type rs)'
        });
    }
    res.json({ publishableKey });
});

// PAYMENT ROUTES (Epic 2: MB-4, MB-8)

// Create payment intent
app.post('/api/create-payment-intent', async (req, res) => {
    try {
        const { amount, currency = 'gbp', planId, userDetails } = req.body;

        if (!amount || !planId) {
            return res.status(400).json({ error: 'Amount and planId are required' });
        }

        const db = getDatabase();
        const memberCheck = await assertMemberAccountForCheckout(db, userDetails?.email);
        if (!memberCheck.ok) {
            return res.status(403).json({ error: memberCheck.error });
        }

        const validation = validatePlanAmount(planId, amount);
        if (!validation.ok) {
            return res.status(400).json({ error: validation.error });
        }

        const amountInCents = validation.amountPence;

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents,
            currency: currency,
            metadata: buildPaymentIntentMetadata(planId, userDetails),
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

// MB-8: Confirm payment and create active membership in MongoDB
app.post('/api/confirm-payment', async (req, res) => {
    try {
        const { paymentIntentId, planId, userDetails } = req.body;
        const db = getDatabase();

        if (!paymentIntentId || !planId || !userDetails) {
            return res.status(400).json({ error: 'Payment intent ID, plan ID, and user details are required' });
        }

        if (!getPlan(planId)) {
            return res.status(400).json({ error: 'Invalid planId' });
        }

        const memberCheck = await assertMemberAccountForCheckout(db, userDetails?.email);
        if (!memberCheck.ok) {
            return res.status(403).json({ error: memberCheck.error });
        }

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== 'succeeded') {
            return res.status(400).json({ error: 'Payment not successful' });
        }

        userDetails.accountUserId = memberCheck.user._id.toString();

        const receiptUrl = await getStripeReceiptUrl(stripe, paymentIntent);

        const { created, membership, membershipId } = await createMembershipFromPaymentIntent(db, {
            planId,
            userDetails,
            paymentIntent,
            receiptUrl
        });

        if (created && receiptUrl) {
            await db.collection('memberships').updateOne(
                { _id: membershipId },
                { $set: { receiptUrl, receiptNumber: paymentIntent.id } }
            );
            membership.receiptUrl = receiptUrl;
        }

        let emailNotification = { sent: false, skipped: true };
        if (created) {
            console.log(`MB-8: Active membership created ${membershipId} for ${userDetails.email} plan ${planId}`);
            emailNotification = await notifyPaymentConfirmation(db, membershipId, membership);
        }

        res.json({
            message: created ? 'Payment confirmed and membership created' : 'Membership already created',
            membershipId: membershipId || membership._id,
            membership: {
                planId: membership.planId,
                planName: membership.planName,
                status: membership.status,
                startDate: membership.startDate,
                endDate: membership.endDate,
                amount: membership.amount,
                receiptUrl: membership.receiptUrl || receiptUrl || null,
                receiptNumber: membership.receiptNumber || paymentIntent.id
            },
            emailConfirmation: emailNotification,
            status: 'success'
        });
    } catch (error) {
        console.error('Payment confirmation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// MB-11: list memberships by email (MB-17/18 billing history uses same API)
app.get('/api/memberships/:userEmail', async (req, res) => {
    try {
        const db = getDatabase();
        const result = await listMembershipsByEmail(db, req.params.userEmail);
        if (!result.ok) {
            return res.status(400).json({ error: result.error });
        }
        // Array response for existing frontends (my-membership, member-dashboard)
        res.json(result.memberships);
    } catch (error) {
        console.error('MB-11 Error fetching memberships:', error);
        res.status(500).json({ error: error.message });
    }
});

// MB-18: billing history and receipts for a member
app.get('/api/memberships/:userEmail/billing-history', async (req, res) => {
    try {
        const db = getDatabase();
        const result = await listBillingHistoryByEmail(db, req.params.userEmail);
        if (!result.ok) {
            return res.status(400).json({ error: result.error });
        }
        res.json(result);
    } catch (error) {
        console.error('MB-18 billing history error:', error);
        res.status(500).json({ error: error.message });
    }
});

// MB-18: refresh receipt URL from Stripe for a past payment (member must own it)
app.get('/api/memberships/:userEmail/receipt/:paymentIntentId', async (req, res) => {
    try {
        const db = getDatabase();
        const { userEmail, paymentIntentId } = req.params;
        const memberCheck = await assertMemberAccountForCheckout(db, userEmail);
        if (!memberCheck.ok) {
            return res.status(403).json({ error: memberCheck.error });
        }

        const membership = await db.collection('memberships').findOne({
            paymentIntentId,
            'userDetails.email': { $regex: new RegExp(`^${memberCheck.user.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });

        if (!membership) {
            return res.status(404).json({ error: 'Payment not found for this account' });
        }

        if (membership.receiptUrl) {
            return res.json({ receiptUrl: membership.receiptUrl, receiptNumber: membership.receiptNumber });
        }

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const receiptUrl = await getStripeReceiptUrl(stripe, paymentIntent);
        if (receiptUrl) {
            await db.collection('memberships').updateOne(
                { _id: membership._id },
                { $set: { receiptUrl, receiptNumber: paymentIntentId } }
            );
        }
        res.json({ receiptUrl, receiptNumber: paymentIntentId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// MB-11 (extended): same data with count + email metadata
app.get('/api/memberships/:userEmail/summary', async (req, res) => {
    try {
        const db = getDatabase();
        const result = await listMembershipsByEmail(db, req.params.userEmail);
        if (!result.ok) {
            return res.status(400).json({ error: result.error });
        }
        res.json({
            email: result.email,
            count: result.count,
            active: result.memberships.filter((m) => m.isActive).length,
            memberships: result.memberships
        });
    } catch (error) {
        console.error('MB-11 summary error:', error);
        res.status(500).json({ error: error.message });
    }
});

// MB-20, MB-21: admin view / filter memberships
function enrichMembershipRow(m) {
    const u = m.userDetails || {};
    return {
        ...m,
        planLabel: getPlan(m.planId)?.name || m.planId,
        isActive: isMembershipActive(m),
        memberName: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
        memberEmail: normalizeEmail(u.email || '')
    };
}

async function listAdminMemberships(db, query = {}) {
    const { status, planId, activeOnly, search } = query;
    const filter = {};
    if (status) filter.status = status;
    if (planId) filter.planId = planId;

    await expireActiveMemberships(db);
    let rows = (await db.collection('memberships').find(filter).sort({ createdAt: -1 }).toArray())
        .map(enrichMembershipRow);

    if (activeOnly === 'true' || activeOnly === '1') {
        rows = rows.filter((m) => m.isActive);
    }

    if (search && String(search).trim()) {
        const q = String(search).trim().toLowerCase();
        rows = rows.filter((m) =>
            (m.memberEmail && m.memberEmail.includes(q)) ||
            (m.memberName && m.memberName.toLowerCase().includes(q)) ||
            (m.planId && m.planId.toLowerCase().includes(q)) ||
            (m.planLabel && m.planLabel.toLowerCase().includes(q))
        );
    }

    return {
        count: rows.length,
        activeCount: rows.filter((m) => m.isActive).length,
        memberships: rows
    };
}

app.get('/api/admin/memberships', async (req, res) => {
    try {
        const result = await listAdminMemberships(getDatabase(), req.query);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// MB-20: active memberships only
app.get('/api/admin/memberships/active', async (req, res) => {
    try {
        const result = await listAdminMemberships(getDatabase(), { ...req.query, activeOnly: 'true' });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// MB-10: manually run expiry (admin / testing)
app.post('/api/admin/expire-memberships', async (req, res) => {
    try {
        const expired = await expireActiveMemberships(getDatabase());
        res.json({ message: 'Expiry check complete', expired });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/admin/billing/stats', async (req, res) => {
    try {
        const db = getDatabase();
        await expireActiveMemberships(db);
        const all = await db.collection('memberships').find({}).toArray();
        const active = all.filter((m) => isMembershipActive(m));
        const revenue = all.reduce((sum, m) => sum + (m.amount || 0), 0);
        const byPlan = {};
        all.forEach((m) => {
            byPlan[m.planId] = byPlan[m.planId] || { count: 0, revenue: 0 };
            byPlan[m.planId].count += 1;
            byPlan[m.planId].revenue += m.amount || 0;
        });
        res.json({
            totalMemberships: all.length,
            activeMemberships: active.length,
            totalRevenue: Math.round(revenue * 100) / 100,
            byPlan
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// MB-23: manual activate / cancel / expire (admin)
app.patch('/api/admin/memberships/:id', async (req, res) => {
    try {
        const { status, action, reason } = req.body;
        const resolved =
            status ||
            (action === 'activate' ? 'active' : action === 'cancel' ? 'cancelled' : action === 'expire' ? 'expired' : null);

        if (!resolved) {
            return res.status(400).json({
                error: 'Provide status (active|cancelled|expired) or action (activate|cancel|expire)'
            });
        }

        const result = await adminUpdateMembershipStatus(getDatabase(), req.params.id, {
            status: resolved,
            reason
        });

        if (!result.ok) {
            const code = result.error === 'Membership not found' ? 404 : 400;
            return res.status(code).json({ error: result.error });
        }

        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});


// SHOP ORDERS (cart checkout from shop.html)

app.get('/api/shop/pickup-locations', (req, res) => {
    res.json({ locations: PICKUP_LOCATIONS });
});

app.post('/api/shop/create-payment-intent', async (req, res) => {
    try {
        const { items, fulfillment, currency = 'gbp' } = req.body;

        const cartResult = validateShopCart(items);
        if (!cartResult.ok) {
            return res.status(400).json({ error: cartResult.error });
        }

        const fulfillmentCheck = validateFulfillment(fulfillment);
        if (!fulfillmentCheck.ok) {
            return res.status(400).json({ error: fulfillmentCheck.error });
        }

        if (!stripeSecretKey) {
            return res.status(503).json({ error: 'Stripe not configured' });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: cartResult.totalPence,
            currency,
            metadata: buildShopPaymentMetadata(cartResult, fulfillment),
            automatic_payment_methods: { enabled: true }
        });

        res.json({
            clientSecret: paymentIntent.client_secret,
            amount: cartResult.total,
            currency
        });
    } catch (error) {
        console.error('Shop payment intent error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/shop/confirm-order', async (req, res) => {
    try {
        const { paymentIntentId, items, fulfillment } = req.body;
        const db = getDatabase();

        if (!paymentIntentId || !items || !fulfillment) {
            return res.status(400).json({ error: 'paymentIntentId, items and fulfillment are required' });
        }

        const cartResult = validateShopCart(items);
        if (!cartResult.ok) {
            return res.status(400).json({ error: cartResult.error });
        }

        const fulfillmentCheck = validateFulfillment(fulfillment);
        if (!fulfillmentCheck.ok) {
            return res.status(400).json({ error: fulfillmentCheck.error });
        }

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (paymentIntent.status !== 'succeeded') {
            return res.status(400).json({ error: 'Payment not successful' });
        }

        if (paymentIntent.metadata?.orderType !== 'shop') {
            return res.status(400).json({ error: 'Invalid payment for shop order' });
        }

        const expectedPence = cartResult.totalPence;
        if (paymentIntent.amount !== expectedPence) {
            return res.status(400).json({ error: 'Payment amount does not match basket total' });
        }

        const { created, order, orderId } = await createShopOrderFromPayment(db, {
            paymentIntent,
            cartResult,
            fulfillment
        });

        res.json({
            message: created ? 'Order confirmed' : 'Order already recorded',
            orderId: orderId || order._id,
            order: {
                total: order.total,
                status: order.status,
                fulfillment: order.fulfillment
            },
            status: 'success'
        });
    } catch (error) {
        console.error('Shop confirm order error:', error);
        res.status(500).json({ error: error.message });
    }
});


// FRONTEND ROUTE

app.get('/', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});


// START SERVER

async function startServer() {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🚀 AuraAthletic Server running on port ${PORT}`);
        console.log(`   Frontend: ${FRONTEND_DIR}`);
        console.log(`   Health: /api/health`);
        console.log(`   API: /api/classes`);
    });

    // Connect DB after listen so Render health checks pass while Atlas connects
    await connectDB();
    const database = getDatabase();
    if (database) {
        startMembershipExpiryJob(database);
        console.log('   MB-10: Membership auto-expiry job started (every 1 hour)');
    }
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