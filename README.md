# GigWorkers Fed - Web Application Context & Workflow Guide

> **Note**: This document outlines the architecture, authentication flow, and routing lifecycle for the **Web Platform** (`client/`). Mobile app endpoints (`client-native/`) are managed separately.

---

## 1. High-Level Overview

The web platform connects two primary stakeholders in the gig economy:
1. **Government Officials (`GovOfficial`)**: Authenticate to review, verify, or reject federations and audit welfare distributions.
2. **Gig Worker Federations (`Federation`)**: Register their organization, declare worker counts and funding amounts, and track verification status.

---

## 2. Authentication & User Journey Map

```mermaid
flowchart TD
    A[Home Page: Login Modal] -->|Google OAuth| B{Check Role & Auth}
    
    %% Government Official Flow
    B -->|Role: GovOfficial| C[/gov/verify - Government Verification Page]
    
    %% Federation Flow
    B -->|Role: Federation| D{First-time Login?}
    
    %% First Time Federation
    D -->|Yes: 201 Created / isNewUser| E[/federation/register - Registration Form]
    E -->|Submit Registration Details| F[/federation/status - Federation Status Page]
    
    %% Returning Federation
    D -->|No: 200 OK / Returning User| F
```

---

## 3. Detailed Role Lifecycles

### A. Government Official (`GovOfficial`)
1. **Login**: User clicks **"Login as a Govt Official"** on the Home page (`/`).
2. **Google OAuth**: Credential verified via `POST /api/web-auth/google` with `userType: 'GovOfficial'`.
3. **Backend Action**: Finds or creates the `GovOfficial` document by `googleId`. Access and refresh tokens are issued.
4. **Redirection**: Frontend receives response and immediately navigates to the **Government Verification Page** (`/gov/verify`).

---

### B. Gig Worker Federation (`Federation`)

#### 1. First-Time Registration Flow (New User)
1. **Login**: User clicks **"Login as a Federation"** on the Home page (`/`).
2. **Google OAuth**: Credential verified via `POST /api/web-auth/google` with `userType: 'Federation'`.
3. **Backend Detection**:
   - Backend detects no existing federation with this Google email.
   - Generates unique Federation ID (e.g., `FED-XXXX`) and initial record.
   - Returns **HTTP 201 Created** with `{ isNewUser: true, accessToken, user }`.
4. **Redirection**: Frontend detects `isNewUser: true` (or HTTP 201) and routes to **Federation Registration Form** (`/federation/register`).
5. **Form Submission**:
   - Form pre-fills authenticated email and name.
   - User inputs remaining federation data: `amount`, `noOfWorkers`, `area`.
   - Submitting the form updates/finalizes the federation profile in the database.
6. **Destination**: On submission success, frontend routes user to the **Federation Status Page** (`/federation/status`).

#### 2. Subsequent Login Flow (Returning User)
1. **Login**: User clicks **"Login as a Federation"** on the Home page (`/`).
2. **Google OAuth**: Authenticated via `POST /api/web-auth/google`.
3. **Backend Detection**:
   - Backend finds existing federation document.
   - Returns **HTTP 200 OK** with `{ isNewUser: false, accessToken, user }`.
4. **Redirection**: Frontend detects existing user and routes directly to the **Federation Status Page** (`/federation/status`), bypassing the registration form.

---

## 4. Key Pages & Routes Summary

| Path | Component | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `/` | `Home.jsx` | Public | Landing page with Google OAuth Login Modal for both roles. |
| `/gov/verify` | `GovernmentVerification.jsx` | Protected (`GovOfficial`) | Dashboard to inspect, verify, or reject federations. |
| `/federation/register` | `FederationRegister.jsx` | Authenticated / First-time | Form to fill in federation details (`amount`, `noOfWorkers`, `area`). |
| `/federation/status` | `FederationStatus.jsx` | Authenticated / Returning | Displays verification status (`unverified`, `verified`, `rejected`), rejection reasons, and federation stats. |

---

## 5. Current Instance vs. Desired Result (Gap Analysis)

| Area | Current Instance | Desired Result | Status |
| :--- | :--- | :--- | :--- |
| **Backend `authController.js`** | Returns `201` + `isNewUser: true` on first signup; `200` + `isNewUser: false` on login. | Differentiates first-time vs. returning user. | ✅ Done |
| **Frontend `Home.jsx`** | Always navigates to `/dashboard` on login. | Route dynamically: `GovOfficial` $\rightarrow$ `/gov/verify`; `Federation` (new) $\rightarrow$ `/federation/register`; `Federation` (returning) $\rightarrow$ `/federation/status`. | ⚠️ Needs Update |
| **Backend Federation Completion** | `POST /api/federation/register` rejects if email already exists (`400`). | Allow updating the federation record if created during initial OAuth step. | ⚠️ Needs Update |
| **Frontend `FederationRegister.jsx`** | Contains a manual email search check and standalone register. | Pre-populate email/name from authenticated user; update existing record; submit $\rightarrow$ redirect to `/federation/status`. | ⚠️ Needs Update |
| **Frontend `FederationStatus.jsx`** | Requires manual search / lookup input if state is missing. | Auto-load status for the currently authenticated federation user. | ⚠️ Needs Update |
| **Route Protection (`App.jsx`)** | `/dashboard` and `/gov/verify` protected; federation routes public. | Ensure appropriate role-based guard or contextual data access. | ⚠️ Needs Polish |
