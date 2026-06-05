# TripReel Booking System — Complete Design Document

## Overview

This document covers the complete booking lifecycle for TripReel — from package creation by operators to payment settlement, ratings, and popularity scoring. Every design decision is documented here so implementation can be done piece by piece.

---

## Core Concepts

### Package (Template)

A Package is created once by an operator and approved once by admin. It contains all the evergreen content about a trip — description, photos, itinerary, inclusions, exclusions, location. Once approved, the core content never changes (unless the operator requests a revision and admin re-approves). The Package accumulates `bookingCount`, `avgRating`, and `reviewCount` across all its batches over its entire lifetime.

### Batch (A Specific Run)

A Batch is one scheduled departure of a Package. It has its own dates, price, and seat count. Operators can add new batches to an already-approved Package at any time without needing re-approval. One Package can have unlimited Batches over time. Operators can also clone a previous batch to save time — just change the dates.

### Booking

A Booking is created when a user selects a Batch and confirms. It links `userId → packageId → batchId`. Admin confirms or cancels it. On confirmation, `bookedSeats` increments on the Batch and `bookingCount` increments on the Package.

### Platform Fee & Operator Wallet

When a booking is confirmed, the system calculates: `operatorAmount = totalAmount - platformFee`. The platform fee percentage is stored in a `PlatformSettings` document in the DB — admin can change it anytime from the admin panel. The operator's wallet balance is credited with `operatorAmount`. Actual money movement (payment gateway) will be added later — for now this is a ledger system.

---

## Data Models

### 1. Batch Model (NEW — separate collection)

```
Batch {
  packageId        ObjectId → Package (required)
  operatorId       ObjectId → Operator (required)

  // Dates
  startDate        Date (required)
  endDate          Date (required)
  bookingDeadline  Date (must be ≤ startDate, required)

  // Pricing — can differ per batch
  adultPrice       Number (required, min 0)
  childPrice       Number (default 0)

  // Seats
  totalSeats       Number (required, min 1)
  bookedSeats      Number (default 0)  ← incremented on booking confirmation

  // Label for display
  label            String (e.g. "Christmas Special", "June Run")

  // Admin can suspend a batch
  isActive         Boolean (default true)

  // Soft status — computed, not stored (see getStatus() below)
  createdAt, updatedAt
}
```

**Computed batch status (derived, never stored):**

```
isBookable   = isActive && bookingDeadline > now && startDate > now && bookedSeats < totalSeats
isUpcoming   = startDate > now
isOngoing    = startDate <= now && endDate >= now
isCompleted  = endDate < now
isFull       = bookedSeats >= totalSeats
```

### 2. Booking Model (UPDATED)

```
Booking {
  bookingId        String (auto-generated, e.g. "TR-BKG-000001")
  userId           ObjectId → User (required)
  packageId        ObjectId → Package (required)
  batchId          ObjectId → Batch (required)

  // Seats booked
  seats            Number (default 1, min 1)

  // Optional traveler names (name auto-filled from user profile for seat 1)
  travelerNames    [String]

  status           Enum: PENDING | CONFIRMED | COMPLETED | CANCELLED

  // Pricing snapshot at time of booking (never changes even if batch price changes)
  pricing {
    adultPrice     Number
    seats          Number
    subtotal       Number       (adultPrice × seats)
    platformFeePercent Number   (snapshot of fee at booking time)
    platformFeeAmount  Number
    gstPercent     Number (default 5)
    gstAmount      Number
    totalAmount    Number       (subtotal + gst)
    operatorAmount Number       (totalAmount - platformFeeAmount)
  }

  // Snapshot of package + batch at time of booking (for receipts, never changes)
  snapshot {
    packageTitle   String
    packageLocation String
    batchLabel     String
    startDate      Date
    endDate        Date
  }

  // Review tracking
  hasReviewed      Boolean (default false)

  // Admin/system notes
  cancelReason     String (filled on cancellation)

  createdAt, updatedAt
}
```

### 3. PlatformSettings Model (NEW)

```
PlatformSettings {
  key              String (unique, e.g. "platform_fee_percent")
  value            Mixed
  label            String (human-readable, e.g. "Platform Fee %")
  updatedBy        ObjectId → User (admin who last changed it)
  updatedAt        Date
}
```

Default values:

- `platform_fee_percent` = 10 (10% platform cut)
- `gst_percent` = 5 (GST on booking)

### 4. OperatorWallet Model (NEW)

```
OperatorWallet {
  operatorId       ObjectId → Operator (unique)
  balance          Number (default 0)  ← total available for withdrawal
  totalEarned      Number (default 0)  ← lifetime earnings
  totalWithdrawn   Number (default 0)
}
```

### 5. WalletTransaction Model (NEW)

```
WalletTransaction {
  operatorId       ObjectId → Operator
  bookingId        ObjectId → Booking
  type             Enum: CREDIT | DEBIT | WITHDRAWAL
  amount           Number
  description      String (e.g. "Booking TR-BKG-000042 confirmed")
  createdAt        Date
}
```

---

## API Endpoints

### Batch Endpoints

| Method | Route                    | Auth     | Description                                              |
| ------ | ------------------------ | -------- | -------------------------------------------------------- |
| GET    | /api/batches?packageId=X | Public   | All active upcoming batches for a package                |
| GET    | /api/batches/:id         | Public   | Single batch detail                                      |
| POST   | /api/batches             | Operator | Create new batch for own approved package                |
| POST   | /api/batches/:id/clone   | Operator | Clone batch (copies price/seats, operator updates dates) |
| PUT    | /api/batches/:id         | Operator | Edit own batch (only if no confirmed bookings yet)       |
| DELETE | /api/batches/:id         | Operator | Delete own batch (only if no confirmed bookings)         |
| PATCH  | /api/batches/:id/active  | Admin    | Suspend/unsuspend a batch                                |

**Batch creation rules:**

- Package must be `status: APPROVED` and belong to the operator
- `startDate` must be in the future
- `endDate` must be after `startDate`
- `bookingDeadline` must be ≤ `startDate`
- No admin approval needed — operator can add freely after package approval

### Booking Endpoints

| Method | Route                    | Auth       | Description                                            |
| ------ | ------------------------ | ---------- | ------------------------------------------------------ |
| POST   | /api/bookings            | User       | Create booking (PENDING)                               |
| GET    | /api/bookings/my         | User       | User's own bookings                                    |
| GET    | /api/bookings/:id        | User/Admin | Single booking detail                                  |
| PATCH  | /api/bookings/:id/status | Admin      | Confirm or cancel booking                              |
| GET    | /api/bookings            | Admin      | All bookings (filterable by status, operator, package) |
| GET    | /api/bookings/operator   | Operator   | Operator's bookings across all their packages          |

**Booking creation rules:**

1. Batch must be `isActive: true`
2. `bookingDeadline` must not have passed (`bookingDeadline >= now`)
3. `startDate` must be in the future
4. `bookedSeats + seats ≤ totalSeats` (no overbooking)
5. User cannot book the same batch twice
6. Fetch current `platform_fee_percent` from PlatformSettings
7. Calculate pricing snapshot (stored forever, never recalculated)
8. Status starts as `PENDING`

**On booking CONFIRMED (admin action):**

1. `Batch.bookedSeats += booking.seats`
2. `Package.bookingCount += booking.seats`
3. Credit operator wallet: `OperatorWallet.balance += pricing.operatorAmount`
4. Create `WalletTransaction` (CREDIT)

**On booking CANCELLED:**

- If was CONFIRMED → `Batch.bookedSeats -= booking.seats`, `Package.bookingCount -= booking.seats`, debit wallet

### Platform Settings Endpoints

| Method | Route                | Auth   | Description                                           |
| ------ | -------------------- | ------ | ----------------------------------------------------- |
| GET    | /api/settings        | Admin  | Get all platform settings                             |
| PATCH  | /api/settings/:key   | Admin  | Update a setting (e.g. platform_fee_percent)          |
| GET    | /api/settings/public | Public | Only non-sensitive settings (gst_percent for display) |

### Operator Wallet Endpoints

| Method | Route                         | Auth     | Description                              |
| ------ | ----------------------------- | -------- | ---------------------------------------- |
| GET    | /api/wallet                   | Operator | Own wallet balance + recent transactions |
| GET    | /api/wallet/transactions      | Operator | Full transaction history                 |
| GET    | /api/wallet/admin/:operatorId | Admin    | View any operator's wallet               |

---

## Cron Job — Auto Status Updates

Runs **daily at midnight** (or can be triggered manually by admin).

```
Job 1 — Auto-complete bookings:
  Find all Bookings where:
    status = CONFIRMED
    AND batch.endDate < today
  → Set status = COMPLETED
  → Set hasReviewed = false (already default, just confirming)

Job 2 — Auto-cancel expired pending bookings:
  Find all Bookings where:
    status = PENDING
    AND batch.bookingDeadline < today
  → Set status = CANCELLED
  → cancelReason = "Booking deadline passed"
  Note: No wallet/seat changes since booking was never confirmed
```

Since we don't have a cron library yet, implement this as:

- A route `POST /api/admin/run-cron` (admin only) that triggers it manually
- Later wire it to `node-cron` or a cloud scheduler

---

## Pricing Calculation

```
subtotal         = adultPrice × seats
platformFeeAmt   = round(subtotal × platformFeePercent / 100)
gstAmt           = round(subtotal × gstPercent / 100)
totalAmount      = subtotal + gstAmt          ← what user pays
operatorAmount   = totalAmount - platformFeeAmt ← what operator receives
```

**Important:** The `platformFeePercent` and `gstPercent` used at booking time are snapshotted into the booking's `pricing` object. If admin changes the platform fee tomorrow, existing bookings are unaffected.

---

## Rating Flow

```
Booking status moves to COMPLETED
    ↓
User opens MyTrips in app
    ↓
API returns bookings where status=COMPLETED and hasReviewed=false
    ↓
App shows "Rate your Goa trip ⭐" card for each
    ↓
User gives 1–5 stars + optional comment
    ↓
POST /api/reviews { packageId, batchId, bookingId, rating, comment }
    ↓
reviewController.recalcPackageRating(packageId):
  - Re-aggregates all visible reviews for this package
  - Updates Package.avgRating, Package.reviewCount
  - If avgRating >= 4.0 AND reviewCount >= 3 → sets badge = "Popular"
    ↓
Booking.hasReviewed = true (can't review twice)
    ↓
Package.avgRating feeds into popularityScore
```

---

## Popularity Score (Final Formula)

Stored on Package, recalculated whenever `bookingCount` or `avgRating` changes:

```
popularityScore = (bookingCount × 2) + (avgRating × 10) + (reviewCount × 0.5)
```

This is computed live in MongoDB aggregation on `GET /api/packages/popular` — not stored, always fresh.

---

## Admin Capabilities

| Action                                                  | Where                            |
| ------------------------------------------------------- | -------------------------------- |
| Approve/reject/revise packages                          | Packages page                    |
| View all batches for a package                          | Package detail modal             |
| Suspend/unsuspend a batch                               | Batch management                 |
| Confirm/cancel bookings                                 | Bookings page                    |
| View operator's packages                                | Operators page → operator detail |
| Suspend an operator (blocks all their packages+batches) | Operators page                   |
| View/edit platform fee %                                | Platform Settings page           |
| View operator wallet balances                           | Wallets page                     |
| Manually trigger cron                                   | Settings page                    |
| View all reviews, hide/show                             | Reviews page (already exists)    |

---

## Operator Capabilities

| Action                                  | Where                                       |
| --------------------------------------- | ------------------------------------------- |
| Create package (template)               | Packages page — creates, waits for approval |
| Add batch to approved package           | Package detail → Add Batch button           |
| Clone an existing batch                 | Batch row → Clone                           |
| Edit batch (if no confirmed bookings)   | Batch row → Edit                            |
| Delete batch (if no confirmed bookings) | Batch row → Delete                          |
| View own bookings                       | Bookings page                               |
| View wallet balance + transactions      | Wallet page                                 |

**Operators cannot:**

- Edit an approved package (must request revision, goes back to PENDING)
- Confirm/cancel bookings (admin only)
- See other operators' data

---

## App (User) Experience

### Package Detail Screen

1. Shows package info (template data)
2. Fetches upcoming batches for this package
3. Shows batch selector — cards sorted by `startDate ASC`
4. Each batch card shows: dates, price, seats left, booking deadline
5. FULL batches shown but grayed out (not selectable)
6. Packages with no upcoming batches show "Currently Unavailable"

### Booking Flow

1. User selects a batch
2. Taps "Book Now"
3. Bottom sheet slides up:
   - Shows trip summary (package name, batch dates, price)
   - Number of seats (1–available, default 1)
   - Traveler names (pre-filled from profile for seat 1, optional for others)
   - Pricing breakdown: subtotal + GST + total
   - "Confirm Booking" button
4. POST /api/bookings → creates PENDING booking
5. Success screen: "Booking Confirmed! Waiting for operator confirmation."
6. Booking appears in MyTrips with status PENDING

### MyTrips Screen

- PENDING: "Awaiting confirmation"
- CONFIRMED: "Confirmed ✓" with trip dates
- COMPLETED: "Trip completed" + "Rate your experience" button if `hasReviewed: false`
- CANCELLED: "Cancelled" with reason

### Rating Sheet (appears after COMPLETED)

- 5-star tap selector
- Optional comment text field
- "Submit Review" button
- After submit: thanks message, star count updates on package

---

## What Changes in Existing Code

### Remove from Package model

- `batches` embedded array → move to separate Batch collection
- Keep `availability` for backward compat with existing 2 packages in DB
- `bookingCount`, `avgRating`, `reviewCount` stay on Package (package-level aggregates)

### Remove from Booking model

- `templateId`, `listingId` → replace with `packageId`, `batchId`
- Keep old fields as optional for backward compat

### Deprecate (keep but stop using)

- `PackageTemplate` model
- `PackageListing` model
- Old booking endpoints that use `listingId`

---

## Implementation Order

### Phase 1 — Backend Core

1. `PlatformSettings` model + seed defaults (platform_fee_percent: 10, gst_percent: 5)
2. `Batch` model + all batch routes (operator CRUD + clone + admin suspend)
3. Update `Package` model — remove embedded batches array
4. Update `Booking` model — add packageId, batchId, seats, pricing snapshot, hasReviewed
5. New booking creation endpoint (with all validations)
6. Update booking confirmation — increment bookedSeats + bookingCount + wallet credit
7. `OperatorWallet` + `WalletTransaction` models + routes
8. Cron endpoint (manual trigger)

### Phase 2 — Admin Panel

9. Platform Settings page — fee editor
10. Batches shown in package review modal
11. Bookings management page
12. Operator wallet view

### Phase 3 — Operator Panel

13. Batch management tab inside approved packages
14. Clone batch button
15. Operator bookings page
16. Operator wallet page

### Phase 4 — App

17. PackageDetailScreen — fetch real batches, remove embedded batch logic
18. Book Now → real booking API call with bottom sheet
19. MyTrips — real bookings from API, status display
20. Rating prompt + review submission

### Phase 5 — Completion

21. Cron job wired to node-cron (auto-complete, auto-cancel)
22. Payment gateway (Razorpay) — future

---

## File Structure (New Files to Create)

```
Backend:
  models/Batch.js
  models/PlatformSettings.js
  models/OperatorWallet.js
  models/WalletTransaction.js
  controllers/batchController.js
  controllers/platformSettingsController.js
  controllers/walletController.js
  routes/batchRoutes.js
  routes/platformSettingsRoutes.js
  routes/walletRoutes.js

Admin:
  src/pages/PlatformSettings.jsx
  src/pages/OperatorWallets.jsx
  (update) src/pages/Packages.jsx — show batches
  (update) src/pages/Bookings.jsx — new booking model

Operator:
  (update) src/pages/operator/Packages.jsx — batch management tab

App:
  src/screens/BookingConfirmScreen.jsx
  (update) src/components/PackageDetailScreen.jsx
  (update) src/screens/MyTripScreen.jsx
```
