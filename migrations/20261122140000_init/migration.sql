-- CreateEnum
CREATE TYPE "OrganizationStatusType" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "RoomTypeType" AS ENUM ('room', 'court', 'lane', 'equipment', 'recovery', 'other');

-- CreateEnum
CREATE TYPE "InstructorAvailabilityTypeType" AS ENUM ('recurring', 'one_time', 'time_off');

-- CreateEnum
CREATE TYPE "AppointmentStatusType" AS ENUM ('scheduled', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show');

-- CreateTable
CREATE TABLE "RetailItem" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "sku" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "unitAmount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "stockOnHand" INTEGER DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailSale" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "lines" JSONB DEFAULT '[]',
    "totalAmount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "tender" TEXT NOT NULL DEFAULT '',
    "paymentReference" TEXT NOT NULL DEFAULT '',
    "soldAt" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailReturn" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "sale" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "lines" JSONB DEFAULT '[]',
    "refundAmount" INTEGER NOT NULL,
    "refundReference" TEXT NOT NULL DEFAULT '',
    "tender" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "returnedAt" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailStockEntry" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailStockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailClose" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "openingAmount" INTEGER,
    "expectedAmount" INTEGER NOT NULL,
    "countedAmount" INTEGER NOT NULL,
    "varianceAmount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "evidence" JSONB DEFAULT '{}',
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounterPaymentAttempt" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "amount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "quote" JSONB DEFAULT '{}',
    "providerId" TEXT NOT NULL DEFAULT '',
    "providerKey" TEXT NOT NULL DEFAULT '',
    "providerCheckoutId" TEXT NOT NULL DEFAULT '',
    "providerPaymentId" TEXT NOT NULL DEFAULT '',
    "providerRefundId" TEXT NOT NULL DEFAULT '',
    "claimToken" TEXT NOT NULL DEFAULT '',
    "result" JSONB DEFAULT '{}',
    "lastError" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounterPaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffIntent" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "actor" TEXT,
    "workspace" TEXT NOT NULL DEFAULT '',
    "operation" TEXT NOT NULL DEFAULT '',
    "scope" TEXT NOT NULL DEFAULT '',
    "requestKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "form" JSONB DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" JSONB DEFAULT '{}',
    "lastError" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberImportRecord" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "externalId" TEXT NOT NULL DEFAULT '',
    "payloadHash" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'processing',
    "member" TEXT,
    "lastError" TEXT NOT NULL DEFAULT '',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberImportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPackage" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL DEFAULT '',
    "durationMinutes" INTEGER NOT NULL,
    "totalCredits" INTEGER NOT NULL,
    "creditsRemaining" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "purchaseReference" TEXT NOT NULL DEFAULT '',
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "refundAmount" INTEGER DEFAULT 0,
    "refundReference" TEXT NOT NULL DEFAULT '',
    "refundedAt" TIMESTAMP(3),
    "terms" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCreditEntry" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "trainingPackage" TEXT NOT NULL,
    "appointment" TEXT,
    "eventKey" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "actor" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingCreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "sourcePath" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'new',
    "staffNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "initialValue" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "purchaserName" TEXT NOT NULL DEFAULT '',
    "purchaserEmail" TEXT NOT NULL DEFAULT '',
    "recipientName" TEXT NOT NULL DEFAULT '',
    "recipientEmail" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "paymentSession" TEXT,
    "stripePaymentIntentId" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "ledger" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipCreditGrant" (
    "id" TEXT NOT NULL,
    "organization" TEXT,
    "key" TEXT NOT NULL DEFAULT '',
    "membership" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "allowance" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipCreditGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipCreditEntry" (
    "id" TEXT NOT NULL,
    "organization" TEXT,
    "key" TEXT NOT NULL DEFAULT '',
    "grant" TEXT,
    "booking" TEXT,
    "delta" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipCreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalNotice" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT,
    "key" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER DEFAULT 0,
    "lastError" TEXT NOT NULL DEFAULT '',
    "resolvedAt" TIMESTAMP(3),
    "history" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipationPolicy" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '',
    "documentReference" TEXT NOT NULL DEFAULT '',
    "documentText" TEXT NOT NULL DEFAULT '',
    "enforceWaiver" BOOLEAN NOT NULL DEFAULT true,
    "adultOnly" BOOLEAN NOT NULL DEFAULT true,
    "healthPurpose" TEXT NOT NULL DEFAULT '',
    "retentionDays" INTEGER DEFAULT 365,
    "publishedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipationEvidence" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT,
    "policy" TEXT,
    "key" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "documentReference" TEXT NOT NULL DEFAULT '',
    "verifiedBy" TEXT NOT NULL DEFAULT '',
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT NOT NULL DEFAULT '',
    "healthConsent" BOOLEAN NOT NULL DEFAULT false,
    "kind" TEXT NOT NULL DEFAULT 'acceptance',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationsCase" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT,
    "key" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "locationId" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedTo" TEXT NOT NULL DEFAULT '',
    "history" JSONB DEFAULT '[]',
    "openedBy" TEXT NOT NULL DEFAULT '',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationsCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "digest" TEXT NOT NULL DEFAULT '',
    "scopes" JSONB DEFAULT '[]',
    "partner" TEXT NOT NULL DEFAULT '',
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "status" "OrganizationStatusType" NOT NULL DEFAULT 'active',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    "isMultiLocation" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organization" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "password" TEXT NOT NULL,
    "role" TEXT,
    "stripeCustomerId" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "emergencyContact" TEXT NOT NULL DEFAULT '',
    "pendingEmail" TEXT NOT NULL DEFAULT '',
    "pendingEmailTokenHash" TEXT NOT NULL DEFAULT '',
    "pendingEmailRequestedAt" TIMESTAMP(3),
    "onboardingStatus" TEXT NOT NULL DEFAULT 'not_started',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passwordResetToken" TEXT,
    "passwordResetIssuedAt" TIMESTAMP(3),
    "passwordResetRedeemedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "organization" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "canCreateRecords" BOOLEAN NOT NULL DEFAULT false,
    "canManageAllRecords" BOOLEAN NOT NULL DEFAULT false,
    "canSeeOtherPeople" BOOLEAN NOT NULL DEFAULT false,
    "canEditOtherPeople" BOOLEAN NOT NULL DEFAULT false,
    "canManagePeople" BOOLEAN NOT NULL DEFAULT false,
    "canManageRoles" BOOLEAN NOT NULL DEFAULT false,
    "canAccessDashboard" BOOLEAN NOT NULL DEFAULT false,
    "canManageOnboarding" BOOLEAN NOT NULL DEFAULT false,
    "canManageSettings" BOOLEAN NOT NULL DEFAULT false,
    "canManageAppointments" BOOLEAN NOT NULL DEFAULT false,
    "canManageCheckIns" BOOLEAN NOT NULL DEFAULT false,
    "canManageFacilities" BOOLEAN NOT NULL DEFAULT false,
    "canManagePrograms" BOOLEAN NOT NULL DEFAULT false,
    "canManageCommunications" BOOLEAN NOT NULL DEFAULT false,
    "canManageRetail" BOOLEAN NOT NULL DEFAULT false,
    "canManagePayroll" BOOLEAN NOT NULL DEFAULT false,
    "canViewReports" BOOLEAN NOT NULL DEFAULT false,
    "isInstructor" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "dateOfBirth" TIMESTAMP(3),
    "joinDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "membershipTier" TEXT,
    "emergencyContactName" TEXT NOT NULL DEFAULT '',
    "emergencyContactPhone" TEXT NOT NULL DEFAULT '',
    "healthNotes" JSONB DEFAULT '{"conditions":[],"injuries":[],"notes":""}',
    "profilePhoto_id" TEXT,
    "profilePhoto_filesize" INTEGER,
    "profilePhoto_width" INTEGER,
    "profilePhoto_height" INTEGER,
    "profilePhoto_extension" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "user" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipTier" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "description" JSONB NOT NULL DEFAULT '[{"type":"paragraph","children":[{"text":""}]}]',
    "monthlyPriceMinor" INTEGER,
    "annualPriceMinor" INTEGER,
    "monthlyPrice" DOUBLE PRECISION NOT NULL,
    "annualPrice" DOUBLE PRECISION NOT NULL,
    "classCreditsPerMonth" INTEGER NOT NULL DEFAULT 0,
    "guestPasses" INTEGER DEFAULT 0,
    "personalTrainingSessions" INTEGER DEFAULT 0,
    "freezeAllowed" BOOLEAN NOT NULL DEFAULT false,
    "contractLength" INTEGER DEFAULT 0,
    "stripeMonthlyPriceId" TEXT NOT NULL DEFAULT '',
    "stripeAnnualPriceId" TEXT NOT NULL DEFAULT '',
    "stripeProductId" TEXT NOT NULL DEFAULT '',
    "price" INTEGER,
    "billingInterval" TEXT DEFAULT 'monthly',
    "features" JSONB DEFAULT '[]',
    "maxClassBookings" INTEGER DEFAULT 0,
    "hasGuestPrivileges" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT,
    "tier" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startDate" TIMESTAMP(3) NOT NULL,
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "agreementSnapshot" JSONB DEFAULT '{}',
    "agreementHistory" JSONB DEFAULT '[]',
    "creditPeriodStart" TIMESTAMP(3),
    "creditPeriodEnd" TIMESTAMP(3),
    "billingEventAt" TIMESTAMP(3),
    "recoveryHistory" JSONB DEFAULT '[]',
    "nextBillingDate" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "classCreditsRemaining" INTEGER DEFAULT 0,
    "freezeStartDate" TIMESTAMP(3),
    "freezeEndDate" TIMESTAMP(3),
    "stripeSubscriptionId" TEXT,
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "cancelledAt" TIMESTAMP(3),
    "billingGeneration" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPayment" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT,
    "membership" TEXT,
    "amount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "paymentType" TEXT NOT NULL DEFAULT 'membership',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" TEXT DEFAULT 'credit-card',
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "stripeInvoiceId" TEXT,
    "receiptNumber" TEXT NOT NULL DEFAULT '',
    "receiptUrl" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "refundedAt" TIMESTAMP(3),
    "refundAmount" INTEGER,
    "refundReason" TEXT NOT NULL DEFAULT '',
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT,
    "membershipTier" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextBillingDate" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "stripeSubscriptionId" TEXT NOT NULL DEFAULT '',
    "stripeCustomerId" TEXT NOT NULL DEFAULT '',
    "providerEventCreated" INTEGER NOT NULL DEFAULT 0,
    "providerEventId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT,
    "subscription" TEXT,
    "paymentProvider" TEXT,
    "paymentSession" TEXT,
    "amount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB DEFAULT '{}',
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "stripeInvoiceId" TEXT,
    "receiptNumber" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "refundedAt" TIMESTAMP(3),
    "refundAmount" INTEGER,
    "refundReason" TEXT NOT NULL DEFAULT '',
    "refundLockUntil" TIMESTAMP(3),
    "refundLockToken" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT,
    "type" TEXT NOT NULL DEFAULT 'card',
    "last4" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "stripePaymentMethodId" TEXT NOT NULL DEFAULT '',
    "expiryMonth" TEXT NOT NULL DEFAULT '',
    "expiryYear" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProvider" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "adapterKey" TEXT NOT NULL DEFAULT '',
    "providerAccountId" TEXT,
    "isInstalled" BOOLEAN NOT NULL DEFAULT true,
    "credentials" JSONB DEFAULT '{}',
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSession" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "user" TEXT,
    "membershipTier" TEXT,
    "paymentProvider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "billingCycle" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "providerSessionId" TEXT,
    "providerCustomerId" TEXT NOT NULL DEFAULT '',
    "providerSubscriptionId" TEXT,
    "checkoutUrl" TEXT,
    "data" JSONB DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "provisioningLockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL DEFAULT '',
    "attempts" INTEGER DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'processing',
    "paymentProvider" TEXT,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "data" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT,
    "checkInTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkOutTime" TIMESTAMP(3),
    "location" TEXT,
    "method" TEXT NOT NULL DEFAULT 'app',
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "guestName" TEXT NOT NULL DEFAULT '',
    "membershipValidated" BOOLEAN NOT NULL DEFAULT false,
    "validationNotes" TEXT NOT NULL DEFAULT '',
    "openCheckInKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioSettings" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "tagline" TEXT NOT NULL DEFAULT '',
    "logoIcon" TEXT NOT NULL DEFAULT '',
    "logoColor" TEXT NOT NULL DEFAULT '0',
    "brandHue" INTEGER NOT NULL DEFAULT 16,
    "description" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "dropInPrice" INTEGER NOT NULL DEFAULT 2500,
    "lateCancelHours" INTEGER NOT NULL DEFAULT 12,
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "countryCode" TEXT NOT NULL DEFAULT 'US',
    "hours" JSONB DEFAULT '{}',
    "heroEyebrow" TEXT NOT NULL DEFAULT '',
    "heroHeadline" TEXT NOT NULL DEFAULT '',
    "heroSubheadline" TEXT NOT NULL DEFAULT '',
    "heroImageUrl" TEXT NOT NULL DEFAULT '',
    "heroPrimaryCtaLabel" TEXT NOT NULL DEFAULT '',
    "heroPrimaryCtaHref" TEXT NOT NULL DEFAULT '',
    "heroSecondaryCtaLabel" TEXT NOT NULL DEFAULT '',
    "heroSecondaryCtaHref" TEXT NOT NULL DEFAULT '',
    "promoBanner" TEXT NOT NULL DEFAULT '',
    "footerTagline" TEXT NOT NULL DEFAULT '',
    "copyrightName" TEXT NOT NULL DEFAULT '',
    "facilityHeadline" TEXT NOT NULL DEFAULT '',
    "facilityDescription" TEXT NOT NULL DEFAULT '',
    "facilityHighlights" JSONB DEFAULT '[]',
    "heroStats" JSONB DEFAULT '[]',
    "contactTopics" JSONB DEFAULT '[]',
    "participationTerms" TEXT NOT NULL DEFAULT '',
    "rating" DECIMAL(2,1) DEFAULT 4.8,
    "reviewCount" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudioSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "booking" TEXT,
    "classSchedule" TEXT,
    "member" TEXT,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "markedAt" TIMESTAMP(3),
    "markedBy" TEXT,
    "noShowReason" TEXT NOT NULL DEFAULT '',
    "lateArrival" BOOLEAN NOT NULL DEFAULT false,
    "minutesLate" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassType" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "description" JSONB NOT NULL DEFAULT '[{"type":"paragraph","children":[{"text":""}]}]',
    "difficulty" TEXT NOT NULL DEFAULT 'all-levels',
    "duration" INTEGER NOT NULL DEFAULT 60,
    "equipmentNeeded" JSONB NOT NULL DEFAULT '[]',
    "caloriesBurn" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSchedule" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT,
    "resource" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "instructor" TEXT,
    "classType" TEXT,
    "dayOfWeek" TEXT NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "maxCapacity" INTEGER NOT NULL DEFAULT 20,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassBooking" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "classInstance" TEXT,
    "member" TEXT,
    "memberName" TEXT NOT NULL DEFAULT '',
    "memberEmail" TEXT NOT NULL DEFAULT '',
    "memberPhone" TEXT NOT NULL DEFAULT '',
    "serviceSnapshot" JSONB,
    "eligibilityReviewReason" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "activeBookingKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "waitlistPosition" INTEGER,
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lateCancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instructor" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "user" TEXT,
    "bio" JSONB NOT NULL DEFAULT '[{"type":"paragraph","children":[{"text":""}]}]',
    "specialties" JSONB DEFAULT '[]',
    "certifications" JSONB DEFAULT '[]',
    "photo" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Instructor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassInstance" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT,
    "resource" TEXT,
    "endsAt" TIMESTAMP(3),
    "changeHistory" JSONB DEFAULT '[]',
    "occurrenceKey" TEXT,
    "classSchedule" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "instructor" TEXT,
    "maxCapacity" INTEGER,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancellationReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "type" "RoomTypeType" NOT NULL DEFAULT 'room',
    "capacity" INTEGER DEFAULT 1,
    "isExclusive" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "setupBufferMinutes" INTEGER DEFAULT 0,
    "cleanupBufferMinutes" INTEGER DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB DEFAULT '{}',
    "allocationHistory" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstructorAvailability" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "instructor" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "type" "InstructorAvailabilityTypeType" NOT NULL DEFAULT 'recurring',
    "dayOfWeek" INTEGER,
    "date" TIMESTAMP(3),
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstructorAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT NOT NULL,
    "instructor" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "resource" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" "AppointmentStatusType" NOT NULL DEFAULT 'scheduled',
    "serviceName" TEXT NOT NULL DEFAULT '',
    "priceAmount" INTEGER DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "memberNotes" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "cancellationReason" TEXT NOT NULL DEFAULT '',
    "cancelledAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "payment" TEXT,
    "trainingPackage" TEXT,
    "replacesAppointment" TEXT,
    "resourceStartsAt" TIMESTAMP(3),
    "resourceEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingRun" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "attempts" INTEGER DEFAULT 0,
    "lastError" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT NOT NULL DEFAULT '',
    "manifest" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trackingBasis" TEXT NOT NULL DEFAULT 'recorded',

    CONSTRAINT "OnboardingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundAttempt" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "payment" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL DEFAULT '',
    "claimToken" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER NOT NULL,
    "startingRefundAmount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT DEFAULT 'processing',
    "providerRefundId" TEXT NOT NULL DEFAULT '',
    "reservation" JSONB,
    "lastError" TEXT NOT NULL DEFAULT '',
    "requestedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trackingBasis" TEXT NOT NULL DEFAULT 'recorded',

    CONSTRAINT "RefundAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipBillingAttempt" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "membership" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "claimToken" TEXT NOT NULL DEFAULT '',
    "generation" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trackingBasis" TEXT NOT NULL DEFAULT 'recorded',

    CONSTRAINT "MembershipBillingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthRateLimitBucket" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthRateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailItem_organization_idx" ON "RetailItem"("organization");

-- CreateIndex
CREATE INDEX "RetailItem_location_idx" ON "RetailItem"("location");

-- CreateIndex
CREATE UNIQUE INDEX "RetailItem_organization_location_sku_key" ON "RetailItem"("organization", "location", "sku");

-- CreateIndex
CREATE INDEX "RetailSale_organization_idx" ON "RetailSale"("organization");

-- CreateIndex
CREATE INDEX "RetailSale_location_idx" ON "RetailSale"("location");

-- CreateIndex
CREATE INDEX "RetailSale_recordedBy_idx" ON "RetailSale"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "RetailSale_organization_requestKey_key" ON "RetailSale"("organization", "requestKey");

-- CreateIndex
CREATE INDEX "RetailReturn_organization_idx" ON "RetailReturn"("organization");

-- CreateIndex
CREATE INDEX "RetailReturn_location_idx" ON "RetailReturn"("location");

-- CreateIndex
CREATE INDEX "RetailReturn_sale_idx" ON "RetailReturn"("sale");

-- CreateIndex
CREATE INDEX "RetailReturn_recordedBy_idx" ON "RetailReturn"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "RetailReturn_organization_requestKey_key" ON "RetailReturn"("organization", "requestKey");

-- CreateIndex
CREATE INDEX "RetailStockEntry_organization_idx" ON "RetailStockEntry"("organization");

-- CreateIndex
CREATE INDEX "RetailStockEntry_location_idx" ON "RetailStockEntry"("location");

-- CreateIndex
CREATE INDEX "RetailStockEntry_item_idx" ON "RetailStockEntry"("item");

-- CreateIndex
CREATE INDEX "RetailStockEntry_recordedBy_idx" ON "RetailStockEntry"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "RetailStockEntry_organization_eventKey_key" ON "RetailStockEntry"("organization", "eventKey");

-- CreateIndex
CREATE INDEX "RetailClose_organization_idx" ON "RetailClose"("organization");

-- CreateIndex
CREATE INDEX "RetailClose_location_idx" ON "RetailClose"("location");

-- CreateIndex
CREATE INDEX "RetailClose_recordedBy_idx" ON "RetailClose"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "RetailClose_organization_requestKey_key" ON "RetailClose"("organization", "requestKey");

-- CreateIndex
CREATE INDEX "CounterPaymentAttempt_organization_idx" ON "CounterPaymentAttempt"("organization");

-- CreateIndex
CREATE INDEX "CounterPaymentAttempt_location_idx" ON "CounterPaymentAttempt"("location");

-- CreateIndex
CREATE INDEX "CounterPaymentAttempt_recordedBy_idx" ON "CounterPaymentAttempt"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "CounterPaymentAttempt_organization_requestKey_key" ON "CounterPaymentAttempt"("organization", "requestKey");

-- CreateIndex
CREATE INDEX "StaffIntent_organization_idx" ON "StaffIntent"("organization");

-- CreateIndex
CREATE INDEX "StaffIntent_actor_idx" ON "StaffIntent"("actor");

-- CreateIndex
CREATE UNIQUE INDEX "StaffIntent_organization_requestKey_key" ON "StaffIntent"("organization", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "MemberImportRecord_key_key" ON "MemberImportRecord"("key");

-- CreateIndex
CREATE INDEX "MemberImportRecord_organization_idx" ON "MemberImportRecord"("organization");

-- CreateIndex
CREATE INDEX "MemberImportRecord_member_idx" ON "MemberImportRecord"("member");

-- CreateIndex
CREATE INDEX "TrainingPackage_organization_idx" ON "TrainingPackage"("organization");

-- CreateIndex
CREATE INDEX "TrainingPackage_member_idx" ON "TrainingPackage"("member");

-- CreateIndex
CREATE INDEX "TrainingPackage_location_idx" ON "TrainingPackage"("location");

-- CreateIndex
CREATE INDEX "TrainingPackage_recordedBy_idx" ON "TrainingPackage"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingPackage_organization_purchaseReference_key" ON "TrainingPackage"("organization", "purchaseReference");

-- CreateIndex
CREATE INDEX "TrainingCreditEntry_organization_idx" ON "TrainingCreditEntry"("organization");

-- CreateIndex
CREATE INDEX "TrainingCreditEntry_trainingPackage_idx" ON "TrainingCreditEntry"("trainingPackage");

-- CreateIndex
CREATE INDEX "TrainingCreditEntry_appointment_idx" ON "TrainingCreditEntry"("appointment");

-- CreateIndex
CREATE INDEX "TrainingCreditEntry_actor_idx" ON "TrainingCreditEntry"("actor");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCreditEntry_organization_eventKey_key" ON "TrainingCreditEntry"("organization", "eventKey");

-- CreateIndex
CREATE INDEX "ContactMessage_organization_idx" ON "ContactMessage"("organization");

-- CreateIndex
CREATE INDEX "ContactMessage_reference_idx" ON "ContactMessage"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_code_key" ON "GiftCard"("code");

-- CreateIndex
CREATE INDEX "GiftCard_organization_idx" ON "GiftCard"("organization");

-- CreateIndex
CREATE INDEX "GiftCard_paymentSession_idx" ON "GiftCard"("paymentSession");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipCreditGrant_key_key" ON "MembershipCreditGrant"("key");

-- CreateIndex
CREATE INDEX "MembershipCreditGrant_organization_idx" ON "MembershipCreditGrant"("organization");

-- CreateIndex
CREATE INDEX "MembershipCreditGrant_membership_idx" ON "MembershipCreditGrant"("membership");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipCreditEntry_key_key" ON "MembershipCreditEntry"("key");

-- CreateIndex
CREATE INDEX "MembershipCreditEntry_organization_idx" ON "MembershipCreditEntry"("organization");

-- CreateIndex
CREATE INDEX "MembershipCreditEntry_grant_idx" ON "MembershipCreditEntry"("grant");

-- CreateIndex
CREATE INDEX "MembershipCreditEntry_booking_idx" ON "MembershipCreditEntry"("booking");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalNotice_key_key" ON "OperationalNotice"("key");

-- CreateIndex
CREATE INDEX "OperationalNotice_organization_idx" ON "OperationalNotice"("organization");

-- CreateIndex
CREATE INDEX "OperationalNotice_member_idx" ON "OperationalNotice"("member");

-- CreateIndex
CREATE INDEX "ParticipationPolicy_organization_idx" ON "ParticipationPolicy"("organization");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipationEvidence_key_key" ON "ParticipationEvidence"("key");

-- CreateIndex
CREATE INDEX "ParticipationEvidence_organization_idx" ON "ParticipationEvidence"("organization");

-- CreateIndex
CREATE INDEX "ParticipationEvidence_member_idx" ON "ParticipationEvidence"("member");

-- CreateIndex
CREATE INDEX "ParticipationEvidence_policy_idx" ON "ParticipationEvidence"("policy");

-- CreateIndex
CREATE UNIQUE INDEX "OperationsCase_key_key" ON "OperationsCase"("key");

-- CreateIndex
CREATE INDEX "OperationsCase_organization_idx" ON "OperationsCase"("organization");

-- CreateIndex
CREATE INDEX "OperationsCase_member_idx" ON "OperationsCase"("member");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_digest_key" ON "IntegrationCredential"("digest");

-- CreateIndex
CREATE INDEX "IntegrationCredential_organization_idx" ON "IntegrationCredential"("organization");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organization_idx" ON "User"("organization");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Role_organization_idx" ON "Role"("organization");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organization_name_key" ON "Role"("organization", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Member_email_key" ON "Member"("email");

-- CreateIndex
CREATE INDEX "Member_organization_idx" ON "Member"("organization");

-- CreateIndex
CREATE INDEX "Member_membershipTier_idx" ON "Member"("membershipTier");

-- CreateIndex
CREATE INDEX "Member_user_idx" ON "Member"("user");

-- CreateIndex
CREATE UNIQUE INDEX "Member_organization_user_key" ON "Member"("organization", "user");

-- CreateIndex
CREATE INDEX "MembershipTier_organization_idx" ON "MembershipTier"("organization");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipTier_organization_name_key" ON "MembershipTier"("organization", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_member_key" ON "Membership"("member");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_stripeSubscriptionId_key" ON "Membership"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Membership_organization_idx" ON "Membership"("organization");

-- CreateIndex
CREATE INDEX "Membership_tier_idx" ON "Membership"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPayment_stripeInvoiceId_key" ON "MembershipPayment"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "MembershipPayment_organization_idx" ON "MembershipPayment"("organization");

-- CreateIndex
CREATE INDEX "MembershipPayment_member_idx" ON "MembershipPayment"("member");

-- CreateIndex
CREATE INDEX "MembershipPayment_membership_idx" ON "MembershipPayment"("membership");

-- CreateIndex
CREATE INDEX "MembershipPayment_receiptNumber_idx" ON "MembershipPayment"("receiptNumber");

-- CreateIndex
CREATE INDEX "MembershipPayment_processedBy_idx" ON "MembershipPayment"("processedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_organization_idx" ON "Subscription"("organization");

-- CreateIndex
CREATE INDEX "Subscription_member_idx" ON "Subscription"("member");

-- CreateIndex
CREATE INDEX "Subscription_membershipTier_idx" ON "Subscription"("membershipTier");

-- CreateIndex
CREATE INDEX "Subscription_paymentMethod_idx" ON "Subscription"("paymentMethod");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeInvoiceId_key" ON "Payment"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "Payment_organization_idx" ON "Payment"("organization");

-- CreateIndex
CREATE INDEX "Payment_member_idx" ON "Payment"("member");

-- CreateIndex
CREATE INDEX "Payment_subscription_idx" ON "Payment"("subscription");

-- CreateIndex
CREATE INDEX "Payment_paymentProvider_idx" ON "Payment"("paymentProvider");

-- CreateIndex
CREATE INDEX "Payment_paymentSession_idx" ON "Payment"("paymentSession");

-- CreateIndex
CREATE INDEX "Payment_receiptNumber_idx" ON "Payment"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_stripePaymentMethodId_key" ON "PaymentMethod"("stripePaymentMethodId");

-- CreateIndex
CREATE INDEX "PaymentMethod_organization_idx" ON "PaymentMethod"("organization");

-- CreateIndex
CREATE INDEX "PaymentMethod_member_idx" ON "PaymentMethod"("member");

-- CreateIndex
CREATE INDEX "PaymentProvider_organization_idx" ON "PaymentProvider"("organization");

-- CreateIndex
CREATE INDEX "PaymentProvider_code_idx" ON "PaymentProvider"("code");

-- CreateIndex
CREATE INDEX "PaymentProvider_providerAccountId_idx" ON "PaymentProvider"("providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProvider_organization_code_key" ON "PaymentProvider"("organization", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_providerSessionId_key" ON "PaymentSession"("providerSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_providerSubscriptionId_key" ON "PaymentSession"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "PaymentSession_organization_idx" ON "PaymentSession"("organization");

-- CreateIndex
CREATE INDEX "PaymentSession_user_idx" ON "PaymentSession"("user");

-- CreateIndex
CREATE INDEX "PaymentSession_membershipTier_idx" ON "PaymentSession"("membershipTier");

-- CreateIndex
CREATE INDEX "PaymentSession_paymentProvider_idx" ON "PaymentSession"("paymentProvider");

-- CreateIndex
CREATE INDEX "PaymentSession_idempotencyKey_idx" ON "PaymentSession"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_organization_idempotency_key" ON "PaymentSession"("organization", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentEvent_organization_idx" ON "PaymentEvent"("organization");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentProvider_idx" ON "PaymentEvent"("paymentProvider");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_event_key" ON "PaymentEvent"("paymentProvider", "providerEventId");

-- CreateIndex
CREATE INDEX "CheckIn_organization_idx" ON "CheckIn"("organization");

-- CreateIndex
CREATE INDEX "CheckIn_member_idx" ON "CheckIn"("member");

-- CreateIndex
CREATE INDEX "CheckIn_location_idx" ON "CheckIn"("location");

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_organization_member_openCheckInKey_key" ON "CheckIn"("organization", "member", "openCheckInKey");

-- CreateIndex
CREATE INDEX "Location_organization_idx" ON "Location"("organization");

-- CreateIndex
CREATE UNIQUE INDEX "Location_organization_name_key" ON "Location"("organization", "name");

-- CreateIndex
CREATE INDEX "StudioSettings_organization_idx" ON "StudioSettings"("organization");

-- CreateIndex
CREATE UNIQUE INDEX "StudioSettings_organization_key" ON "StudioSettings"("organization");

-- CreateIndex
CREATE INDEX "AttendanceRecord_organization_idx" ON "AttendanceRecord"("organization");

-- CreateIndex
CREATE INDEX "AttendanceRecord_booking_idx" ON "AttendanceRecord"("booking");

-- CreateIndex
CREATE INDEX "AttendanceRecord_classSchedule_idx" ON "AttendanceRecord"("classSchedule");

-- CreateIndex
CREATE INDEX "AttendanceRecord_member_idx" ON "AttendanceRecord"("member");

-- CreateIndex
CREATE INDEX "AttendanceRecord_markedBy_idx" ON "AttendanceRecord"("markedBy");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_organization_booking_key" ON "AttendanceRecord"("organization", "booking");

-- CreateIndex
CREATE INDEX "ClassType_organization_idx" ON "ClassType"("organization");

-- CreateIndex
CREATE UNIQUE INDEX "ClassType_organization_name_key" ON "ClassType"("organization", "name");

-- CreateIndex
CREATE INDEX "ClassSchedule_organization_idx" ON "ClassSchedule"("organization");

-- CreateIndex
CREATE INDEX "ClassSchedule_location_idx" ON "ClassSchedule"("location");

-- CreateIndex
CREATE INDEX "ClassSchedule_resource_idx" ON "ClassSchedule"("resource");

-- CreateIndex
CREATE INDEX "ClassSchedule_instructor_idx" ON "ClassSchedule"("instructor");

-- CreateIndex
CREATE INDEX "ClassSchedule_classType_idx" ON "ClassSchedule"("classType");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSchedule_organization_name_dayOfWeek_startTime_instruc_key" ON "ClassSchedule"("organization", "name", "dayOfWeek", "startTime", "instructor");

-- CreateIndex
CREATE INDEX "ClassBooking_organization_idx" ON "ClassBooking"("organization");

-- CreateIndex
CREATE INDEX "ClassBooking_classInstance_idx" ON "ClassBooking"("classInstance");

-- CreateIndex
CREATE INDEX "ClassBooking_member_idx" ON "ClassBooking"("member");

-- CreateIndex
CREATE UNIQUE INDEX "ClassBooking_organization_classInstance_member_activeBookin_key" ON "ClassBooking"("organization", "classInstance", "member", "activeBookingKey");

-- CreateIndex
CREATE INDEX "Instructor_organization_idx" ON "Instructor"("organization");

-- CreateIndex
CREATE INDEX "Instructor_user_idx" ON "Instructor"("user");

-- CreateIndex
CREATE UNIQUE INDEX "Instructor_organization_user_key" ON "Instructor"("organization", "user");

-- CreateIndex
CREATE UNIQUE INDEX "ClassInstance_occurrenceKey_key" ON "ClassInstance"("occurrenceKey");

-- CreateIndex
CREATE INDEX "ClassInstance_organization_idx" ON "ClassInstance"("organization");

-- CreateIndex
CREATE INDEX "ClassInstance_location_idx" ON "ClassInstance"("location");

-- CreateIndex
CREATE INDEX "ClassInstance_resource_idx" ON "ClassInstance"("resource");

-- CreateIndex
CREATE INDEX "ClassInstance_classSchedule_idx" ON "ClassInstance"("classSchedule");

-- CreateIndex
CREATE INDEX "ClassInstance_instructor_idx" ON "ClassInstance"("instructor");

-- CreateIndex
CREATE UNIQUE INDEX "ClassInstance_organization_classSchedule_date_key" ON "ClassInstance"("organization", "classSchedule", "date");

-- CreateIndex
CREATE INDEX "Room_organization_idx" ON "Room"("organization");

-- CreateIndex
CREATE INDEX "Room_location_idx" ON "Room"("location");

-- CreateIndex
CREATE INDEX "InstructorAvailability_organization_idx" ON "InstructorAvailability"("organization");

-- CreateIndex
CREATE INDEX "InstructorAvailability_instructor_idx" ON "InstructorAvailability"("instructor");

-- CreateIndex
CREATE INDEX "InstructorAvailability_location_idx" ON "InstructorAvailability"("location");

-- CreateIndex
CREATE INDEX "Appointment_organization_idx" ON "Appointment"("organization");

-- CreateIndex
CREATE INDEX "Appointment_member_idx" ON "Appointment"("member");

-- CreateIndex
CREATE INDEX "Appointment_instructor_idx" ON "Appointment"("instructor");

-- CreateIndex
CREATE INDEX "Appointment_location_idx" ON "Appointment"("location");

-- CreateIndex
CREATE INDEX "Appointment_resource_idx" ON "Appointment"("resource");

-- CreateIndex
CREATE INDEX "Appointment_idempotencyKey_idx" ON "Appointment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Appointment_payment_idx" ON "Appointment"("payment");

-- CreateIndex
CREATE INDEX "Appointment_trainingPackage_idx" ON "Appointment"("trainingPackage");

-- CreateIndex
CREATE INDEX "Appointment_replacesAppointment_idx" ON "Appointment"("replacesAppointment");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_organization_idempotency_key" ON "Appointment"("organization", "idempotencyKey");

-- CreateIndex
CREATE INDEX "OnboardingRun_organization_idx" ON "OnboardingRun"("organization");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingRun_organization_key" ON "OnboardingRun"("organization");

-- CreateIndex
CREATE INDEX "RefundAttempt_organization_idx" ON "RefundAttempt"("organization");

-- CreateIndex
CREATE INDEX "RefundAttempt_payment_idx" ON "RefundAttempt"("payment");

-- CreateIndex
CREATE UNIQUE INDEX "RefundAttempt_organization_request_key" ON "RefundAttempt"("organization", "requestKey");

-- CreateIndex
CREATE INDEX "MembershipBillingAttempt_organization_idx" ON "MembershipBillingAttempt"("organization");

-- CreateIndex
CREATE INDEX "MembershipBillingAttempt_membership_idx" ON "MembershipBillingAttempt"("membership");

-- CreateIndex
CREATE INDEX "MembershipBillingAttempt_membership_status_lease" ON "MembershipBillingAttempt"("membership", "status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipBillingAttempt_scope_operation_key" ON "MembershipBillingAttempt"("organization", "membership", "operation", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AuthRateLimitBucket_key" ON "AuthRateLimitBucket"("key");

-- AddForeignKey
ALTER TABLE "RetailItem" ADD CONSTRAINT "RetailItem_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailItem" ADD CONSTRAINT "RetailItem_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailReturn" ADD CONSTRAINT "RetailReturn_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailReturn" ADD CONSTRAINT "RetailReturn_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailReturn" ADD CONSTRAINT "RetailReturn_sale_fkey" FOREIGN KEY ("sale") REFERENCES "RetailSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailReturn" ADD CONSTRAINT "RetailReturn_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockEntry" ADD CONSTRAINT "RetailStockEntry_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockEntry" ADD CONSTRAINT "RetailStockEntry_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockEntry" ADD CONSTRAINT "RetailStockEntry_item_fkey" FOREIGN KEY ("item") REFERENCES "RetailItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockEntry" ADD CONSTRAINT "RetailStockEntry_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailClose" ADD CONSTRAINT "RetailClose_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailClose" ADD CONSTRAINT "RetailClose_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailClose" ADD CONSTRAINT "RetailClose_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterPaymentAttempt" ADD CONSTRAINT "CounterPaymentAttempt_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterPaymentAttempt" ADD CONSTRAINT "CounterPaymentAttempt_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterPaymentAttempt" ADD CONSTRAINT "CounterPaymentAttempt_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffIntent" ADD CONSTRAINT "StaffIntent_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffIntent" ADD CONSTRAINT "StaffIntent_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberImportRecord" ADD CONSTRAINT "MemberImportRecord_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberImportRecord" ADD CONSTRAINT "MemberImportRecord_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPackage" ADD CONSTRAINT "TrainingPackage_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPackage" ADD CONSTRAINT "TrainingPackage_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPackage" ADD CONSTRAINT "TrainingPackage_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPackage" ADD CONSTRAINT "TrainingPackage_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCreditEntry" ADD CONSTRAINT "TrainingCreditEntry_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCreditEntry" ADD CONSTRAINT "TrainingCreditEntry_trainingPackage_fkey" FOREIGN KEY ("trainingPackage") REFERENCES "TrainingPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCreditEntry" ADD CONSTRAINT "TrainingCreditEntry_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCreditEntry" ADD CONSTRAINT "TrainingCreditEntry_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_paymentSession_fkey" FOREIGN KEY ("paymentSession") REFERENCES "PaymentSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCreditGrant" ADD CONSTRAINT "MembershipCreditGrant_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCreditGrant" ADD CONSTRAINT "MembershipCreditGrant_membership_fkey" FOREIGN KEY ("membership") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCreditEntry" ADD CONSTRAINT "MembershipCreditEntry_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCreditEntry" ADD CONSTRAINT "MembershipCreditEntry_grant_fkey" FOREIGN KEY ("grant") REFERENCES "MembershipCreditGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipCreditEntry" ADD CONSTRAINT "MembershipCreditEntry_booking_fkey" FOREIGN KEY ("booking") REFERENCES "ClassBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalNotice" ADD CONSTRAINT "OperationalNotice_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalNotice" ADD CONSTRAINT "OperationalNotice_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationPolicy" ADD CONSTRAINT "ParticipationPolicy_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationEvidence" ADD CONSTRAINT "ParticipationEvidence_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationEvidence" ADD CONSTRAINT "ParticipationEvidence_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipationEvidence" ADD CONSTRAINT "ParticipationEvidence_policy_fkey" FOREIGN KEY ("policy") REFERENCES "ParticipationPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_role_fkey" FOREIGN KEY ("role") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_membershipTier_fkey" FOREIGN KEY ("membershipTier") REFERENCES "MembershipTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipTier" ADD CONSTRAINT "MembershipTier_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_member_fkey" FOREIGN KEY ("member") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tier_fkey" FOREIGN KEY ("tier") REFERENCES "MembershipTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPayment" ADD CONSTRAINT "MembershipPayment_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPayment" ADD CONSTRAINT "MembershipPayment_member_fkey" FOREIGN KEY ("member") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPayment" ADD CONSTRAINT "MembershipPayment_membership_fkey" FOREIGN KEY ("membership") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPayment" ADD CONSTRAINT "MembershipPayment_processedBy_fkey" FOREIGN KEY ("processedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_membershipTier_fkey" FOREIGN KEY ("membershipTier") REFERENCES "MembershipTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_paymentMethod_fkey" FOREIGN KEY ("paymentMethod") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscription_fkey" FOREIGN KEY ("subscription") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentProvider_fkey" FOREIGN KEY ("paymentProvider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentSession_fkey" FOREIGN KEY ("paymentSession") REFERENCES "PaymentSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProvider" ADD CONSTRAINT "PaymentProvider_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_membershipTier_fkey" FOREIGN KEY ("membershipTier") REFERENCES "MembershipTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_paymentProvider_fkey" FOREIGN KEY ("paymentProvider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentProvider_fkey" FOREIGN KEY ("paymentProvider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioSettings" ADD CONSTRAINT "StudioSettings_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_booking_fkey" FOREIGN KEY ("booking") REFERENCES "ClassBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_classSchedule_fkey" FOREIGN KEY ("classSchedule") REFERENCES "ClassSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_markedBy_fkey" FOREIGN KEY ("markedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassType" ADD CONSTRAINT "ClassType_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSchedule" ADD CONSTRAINT "ClassSchedule_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSchedule" ADD CONSTRAINT "ClassSchedule_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSchedule" ADD CONSTRAINT "ClassSchedule_resource_fkey" FOREIGN KEY ("resource") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSchedule" ADD CONSTRAINT "ClassSchedule_instructor_fkey" FOREIGN KEY ("instructor") REFERENCES "Instructor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSchedule" ADD CONSTRAINT "ClassSchedule_classType_fkey" FOREIGN KEY ("classType") REFERENCES "ClassType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassBooking" ADD CONSTRAINT "ClassBooking_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassBooking" ADD CONSTRAINT "ClassBooking_classInstance_fkey" FOREIGN KEY ("classInstance") REFERENCES "ClassInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassBooking" ADD CONSTRAINT "ClassBooking_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instructor" ADD CONSTRAINT "Instructor_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instructor" ADD CONSTRAINT "Instructor_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassInstance" ADD CONSTRAINT "ClassInstance_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassInstance" ADD CONSTRAINT "ClassInstance_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassInstance" ADD CONSTRAINT "ClassInstance_resource_fkey" FOREIGN KEY ("resource") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassInstance" ADD CONSTRAINT "ClassInstance_classSchedule_fkey" FOREIGN KEY ("classSchedule") REFERENCES "ClassSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassInstance" ADD CONSTRAINT "ClassInstance_instructor_fkey" FOREIGN KEY ("instructor") REFERENCES "Instructor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorAvailability" ADD CONSTRAINT "InstructorAvailability_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorAvailability" ADD CONSTRAINT "InstructorAvailability_instructor_fkey" FOREIGN KEY ("instructor") REFERENCES "Instructor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstructorAvailability" ADD CONSTRAINT "InstructorAvailability_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_instructor_fkey" FOREIGN KEY ("instructor") REFERENCES "Instructor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_location_fkey" FOREIGN KEY ("location") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_resource_fkey" FOREIGN KEY ("resource") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_trainingPackage_fkey" FOREIGN KEY ("trainingPackage") REFERENCES "TrainingPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_replacesAppointment_fkey" FOREIGN KEY ("replacesAppointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingRun" ADD CONSTRAINT "OnboardingRun_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundAttempt" ADD CONSTRAINT "RefundAttempt_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundAttempt" ADD CONSTRAINT "RefundAttempt_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipBillingAttempt" ADD CONSTRAINT "MembershipBillingAttempt_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipBillingAttempt" ADD CONSTRAINT "MembershipBillingAttempt_membership_fkey" FOREIGN KEY ("membership") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

