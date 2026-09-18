CREATE TABLE IF NOT EXISTS "user" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  "emailVerified" boolean DEFAULT false NOT NULL,
  image text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  role text,
  banned boolean DEFAULT false,
  "banReason" text,
  "banExpires" timestamp with time zone,
  CONSTRAINT user_email_unique UNIQUE (email)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "expiresAt" timestamp with time zone NOT NULL,
  token text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid NOT NULL,
  "impersonatedBy" text,
  CONSTRAINT session_token_unique UNIQUE (token),
  CONSTRAINT session_user_id_user_id_fk
    FOREIGN KEY ("userId") REFERENCES "user" (id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" uuid NOT NULL,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamp with time zone,
  "refreshTokenExpiresAt" timestamp with time zone,
  scope text,
  password text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone NOT NULL,
  CONSTRAINT account_user_id_user_id_fk
    FOREIGN KEY ("userId") REFERENCES "user" (id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON account ("userId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamp with time zone NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS verification_identifier_idx
  ON verification (identifier);
