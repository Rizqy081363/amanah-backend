import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
  account,
  authAccounts,
  clinicUnits,
  practitioners,
  roles,
  staffAddresses,
  staffCredentials,
  staffProfiles,
  staffRosters,
  user,
  userRoles,
  users,
} from '../schema';
import * as relations from '../schema/amanah.relations';
import * as tables from '../schema/amanah.schema';
import * as queueRelations from '../schema/queue-ticketing.relations';
import * as queueTables from '../schema/queue-ticketing.schema';

const DEFAULT_POSTGRES_PORT = 5433;

function getDatabaseConfig() {
  const host = process.env.DATABASE_HOST || 'localhost';
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const port = parseInt(
    isLocal
      ? process.env.POSTGRES_HOST_PORT ||
          process.env.DATABASE_PORT ||
          String(DEFAULT_POSTGRES_PORT)
      : process.env.DATABASE_PORT || '5432',
    10,
  );
  const user = process.env.DATABASE_USERNAME || 'amanah';
  const password = process.env.DATABASE_PASSWORD || 'amanah_secret';
  const database = process.env.DATABASE_NAME || 'amanah_healthcare';

  return { host, port, user, password, database };
}

const seedStaffMembers = [
  {
    email: 'staff.it@amanah.clinic',
    fullName: 'Rian Hidayat, S.Kom',
    roleCode: 'staff_worker',
    betterAuthRole: 'staffWorker',
    staffType: 'worker' as const,
    staffCode: 'STF-IT-001',
    positionTitle: 'Staf IT & Operasional',
    phone: '+6281122334401',
    birthPlace: 'Bogor',
    birthDate: '1995-04-12',
    gender: 'male' as const,
    nationalId: '3201011204950001',
    address: {
      provinceCode: '32',
      provinceName: 'Jawa Barat',
      regencyCode: '3201',
      regencyName: 'Kabupaten Bogor',
      districtCode: '320101',
      districtName: 'Cibinong',
      villageCode: '3201012001',
      villageName: 'Pakansari',
      line1: 'Jl. Raya Tegar Beriman No. 12',
      fullAddress:
        'Jl. Raya Tegar Beriman No. 12, Kel. Pakansari, Kec. Cibinong, Kabupaten Bogor, Prov. Jawa Barat',
    },
  },
  {
    email: 'staff.frontdesk@amanah.clinic',
    fullName: 'Dewi Anggraini, A.Md',
    roleCode: 'staff_worker',
    betterAuthRole: 'staffWorker',
    staffType: 'worker' as const,
    staffCode: 'STF-REC-001',
    positionTitle: 'Resepsionis & Loket Pendaftaran',
    phone: '+6281122334402',
    birthPlace: 'Jakarta',
    birthDate: '1998-08-20',
    gender: 'female' as const,
    nationalId: '3171016008980002',
    address: {
      provinceCode: '32',
      provinceName: 'Jawa Barat',
      regencyCode: '3201',
      regencyName: 'Kabupaten Bogor',
      districtCode: '320101',
      districtName: 'Cibinong',
      villageCode: '3201012003',
      villageName: 'Tengah',
      line1: 'Jl. Mayor Oking Jaya Atmaja No. 45',
      fullAddress:
        'Jl. Mayor Oking Jaya Atmaja No. 45, Kel. Tengah, Kec. Cibinong, Kabupaten Bogor, Prov. Jawa Barat',
    },
  },
  {
    email: 'staff.operasional@amanah.clinic',
    fullName: 'Budi Santoso',
    roleCode: 'staff_worker',
    betterAuthRole: 'staffWorker',
    staffType: 'worker' as const,
    staffCode: 'STF-OPS-001',
    positionTitle: 'Staf Operasional Umum',
    phone: '+6281122334404',
    birthPlace: 'Cibinong',
    birthDate: '1990-06-15',
    gender: 'male' as const,
    nationalId: '3201011506900004',
    address: {
      provinceCode: '32',
      provinceName: 'Jawa Barat',
      regencyCode: '3201',
      regencyName: 'Kabupaten Bogor',
      districtCode: '320101',
      districtName: 'Cibinong',
      villageCode: '3201012001',
      villageName: 'Pakansari',
      line1: 'Jl. Roda Pembangunan No. 15',
      fullAddress:
        'Jl. Roda Pembangunan No. 15, Kel. Pakansari, Kec. Cibinong, Kabupaten Bogor, Prov. Jawa Barat',
    },
  },
];

async function runStaffSeeder() {
  const dbConfig = getDatabaseConfig();
  console.log(`Connecting to Postgres at ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}...`);

  const pool = new Pool(dbConfig);
  const db = drizzle(pool, {
    schema: {
      ...tables,
      ...relations,
      ...queueTables,
      ...queueRelations,
    },
  });

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('Password123!', salt);

  try {
    for (const member of seedStaffMembers) {
      console.log(`\n--- Seeding Staff: ${member.fullName} (${member.email}) ---`);

      // 1. Find or create user
      let userRecord = await db.query.users.findFirst({
        where: eq(users.email, member.email),
      });

      if (!userRecord) {
        const [createdUser] = await db
          .insert(users)
          .values({
            name: member.fullName,
            email: member.email,
            phone: member.phone,
            emailVerified: true,
            status: 'active',
            preferredLocale: 'id-ID',
          })
          .returning();
        userRecord = createdUser;
        console.log(`  ✓ Created user ID: ${userRecord.id}`);
      } else {
        await db
          .update(users)
          .set({
            name: member.fullName,
            phone: member.phone,
            status: 'active',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(users.id, userRecord.id));
        console.log(`  ✓ Updated existing user ID: ${userRecord.id}`);
      }

      // 2. Auth credentials
      const existingAccount = await db.query.authAccounts.findFirst({
        where: and(
          eq(authAccounts.userId, userRecord.id),
          eq(authAccounts.providerId, 'credential'),
        ),
      });

      if (!existingAccount) {
        await db.insert(authAccounts).values({
          userId: userRecord.id,
          providerId: 'credential',
          accountId: member.email,
          passwordHash,
        });
        console.log('  ✓ Created auth account');
      } else {
        await db
          .update(authAccounts)
          .set({ passwordHash, updatedAt: new Date().toISOString() })
          .where(eq(authAccounts.id, existingAccount.id));
        console.log('  ✓ Updated auth account credentials');
      }

      // Better Auth sync
      try {
        const [existingBetterUser] = await db
          .select()
          .from(user)
          .where(eq(user.id, userRecord.id))
          .limit(1);

        if (!existingBetterUser) {
          await db.insert(user).values({
            id: userRecord.id,
            name: member.fullName,
            email: member.email,
            emailVerified: true,
            role: member.betterAuthRole,
            banned: false,
          });
          await db.insert(account).values({
            accountId: userRecord.id,
            providerId: 'credential',
            userId: userRecord.id,
            password: passwordHash,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch {
        // Non-blocking
      }

      // 3. User Roles
      const targetRole = await db.query.roles.findFirst({
        where: eq(roles.code, member.roleCode),
      });

      if (targetRole) {
        await db.delete(userRoles).where(eq(userRoles.userId, userRecord.id));
        await db.insert(userRoles).values({
          userId: userRecord.id,
          roleId: targetRole.id,
        });
        console.log(`  ✓ Assigned role: ${member.roleCode}`);
      }

      // 4. Staff Profile (Workers have no clinic unit association)
      let staffRecord = await db.query.staffProfiles.findFirst({
        where: eq(staffProfiles.userId, userRecord.id),
      });

      if (!staffRecord) {
        const [createdStaff] = await db
          .insert(staffProfiles)
          .values({
            userId: userRecord.id,
            staffCode: member.staffCode,
            fullName: member.fullName,
            staffType: member.staffType,
            positionTitle: member.positionTitle,
            birthPlace: member.birthPlace,
            birthDate: member.birthDate,
            gender: member.gender,
            nationalIdHash: member.nationalId,
            nationalIdEncrypted: member.nationalId,
            phone: member.phone,
            email: member.email,
            primaryUnitId: null,
            status: 'active',
          })
          .returning();
        staffRecord = createdStaff;
        console.log(`  ✓ Created staff profile ID: ${staffRecord.id}`);
      } else {
        const [updatedStaff] = await db
          .update(staffProfiles)
          .set({
            staffCode: member.staffCode,
            fullName: member.fullName,
            staffType: member.staffType,
            positionTitle: member.positionTitle,
            birthPlace: member.birthPlace,
            birthDate: member.birthDate,
            gender: member.gender,
            nationalIdHash: member.nationalId,
            nationalIdEncrypted: member.nationalId,
            phone: member.phone,
            primaryUnitId: null,
            status: 'active',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(staffProfiles.id, staffRecord.id))
          .returning();
        staffRecord = updatedStaff;
        console.log(`  ✓ Updated staff profile ID: ${staffRecord.id}`);
      }

      // 6. Regional Address
      const existingAddr = await db.query.staffAddresses.findFirst({
        where: and(
          eq(staffAddresses.staffProfileId, staffRecord.id),
          eq(staffAddresses.isPrimary, true),
        ),
      });

      if (!existingAddr) {
        await db.insert(staffAddresses).values({
          staffProfileId: staffRecord.id,
          type: 'domicile',
          provinceCode: member.address.provinceCode,
          provinceName: member.address.provinceName,
          regencyCode: member.address.regencyCode,
          regencyName: member.address.regencyName,
          districtCode: member.address.districtCode,
          districtName: member.address.districtName,
          villageCode: member.address.villageCode,
          villageName: member.address.villageName,
          line1: member.address.line1,
          fullAddress: member.address.fullAddress,
          isPrimary: true,
        });
        console.log(`  ✓ Created primary regional address in staff_addresses`);
      } else {
        await db
          .update(staffAddresses)
          .set({
            provinceCode: member.address.provinceCode,
            provinceName: member.address.provinceName,
            regencyCode: member.address.regencyCode,
            regencyName: member.address.regencyName,
            districtCode: member.address.districtCode,
            districtName: member.address.districtName,
            villageCode: member.address.villageCode,
            villageName: member.address.villageName,
            line1: member.address.line1,
            fullAddress: member.address.fullAddress,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(staffAddresses.id, existingAddr.id));
        console.log(`  ✓ Updated existing address in staff_addresses`);
      }

      // 7. Practitioner record (Doctor only)
      if (member.staffType === 'doctor') {
        let practitioner = await db.query.practitioners.findFirst({
          where: eq(practitioners.staffProfileId, staffRecord.id),
        });

        if (!practitioner) {
          const [newPrac] = await db
            .insert(practitioners)
            .values({
              staffProfileId: staffRecord.id,
              displayName: member.fullName,
              licenseNumber: member.licenseNumber || null,
              isAcceptingAppointments: true,
            })
            .returning();
          practitioner = newPrac;
          console.log(`  ✓ Created practitioner ID: ${practitioner.id}`);
        } else {
          await db
            .update(practitioners)
            .set({
              displayName: member.fullName,
              licenseNumber: member.licenseNumber || practitioner.licenseNumber,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(practitioners.id, practitioner.id));
          console.log(`  ✓ Updated practitioner ID: ${practitioner.id}`);
        }
      }

      // 8. Credentials (SIP / STR)
      if (member.licenseNumber) {
        const existingCred = await db.query.staffCredentials.findFirst({
          where: eq(staffCredentials.staffProfileId, staffRecord.id),
        });

        if (!existingCred) {
          await db.insert(staffCredentials).values({
            staffProfileId: staffRecord.id,
            credentialType: 'sip',
            credentialNumberHash: member.licenseNumber,
            credentialNumberEncrypted: member.licenseNumber,
            issuer: 'Dinas Kesehatan Kabupaten Bogor',
            status: 'verified',
            verifiedAt: new Date().toISOString(),
          });
          console.log(`  ✓ Created verified credential (${member.licenseNumber})`);
        }
      }
    }

    console.log('\n=== Staff Seeding Completed Successfully! ===\n');
  } catch (error) {
    console.error('Staff Seeder failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runStaffSeeder();
