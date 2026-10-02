import { padRight } from './purge-helpers';
import type {
  PatientAppointmentSummary,
  UserAppointmentDetail,
  UserAppointmentSummary,
} from './appointment-purge.service';

export function renderUsersTable(list: UserAppointmentSummary[]): void {
  if (list.length === 0) {
    console.log('No users found with appointments.');
    return;
  }
  const idxW = 4;
  const nameW = 24;
  const emailW = 28;
  const cntW = 8;
  const idW = 36;

  console.log(
    padRight('#', idxW) + ' ' + padRight('User Name', nameW) + ' ' +
    padRight('Email', emailW) + ' ' + padRight('Appts', cntW) + ' ' +
    padRight('User ID', idW)
  );
  console.log('-'.repeat(idxW + nameW + emailW + cntW + idW + 4));

  list.forEach((u, i) => {
    console.log(
      padRight(String(i + 1), idxW) + ' ' + padRight(u.name, nameW) + ' ' +
      padRight(u.email, emailW) + ' ' + padRight(String(u.appointmentCount), cntW) + ' ' +
      padRight(u.userId, idW)
    );
  });
  console.log(`\nShowing ${list.length} user(s) with registered appointments.`);
}

export function renderAppointmentsTable(list: UserAppointmentDetail[]): void {
  const idxW = 4;
  const codeW = 20;
  const dateW = 12;
  const sessW = 8;
  const srvW = 24;
  const patW = 20;
  const statW = 12;

  console.log(
    padRight('#', idxW) + ' ' + padRight('Booking Code', codeW) + ' ' +
    padRight('Date', dateW) + ' ' + padRight('Shift', sessW) + ' ' +
    padRight('Service', srvW) + ' ' + padRight('Patient Name', patW) + ' ' +
    padRight('Status', statW)
  );
  console.log('-'.repeat(idxW + codeW + dateW + sessW + srvW + patW + statW + 6));

  list.forEach((a, i) => {
    console.log(
      padRight(String(i + 1), idxW) + ' ' + padRight(a.bookingCode, codeW) + ' ' +
      padRight(a.scheduledDate, dateW) + ' ' + padRight(a.session, sessW) + ' ' +
      padRight(a.serviceName, srvW) + ' ' + padRight(a.patientName, patW) + ' ' +
      padRight(a.status, statW)
    );
  });
}

export function renderPatientsTable(list: PatientAppointmentSummary[]): void {
  if (list.length === 0) {
    console.log('No patients found with registered appointments.');
    return;
  }
  const idxW = 4;
  const nameW = 24;
  const emailW = 28;
  const cntW = 8;
  const idW = 36;

  console.log(
    padRight('#', idxW) + ' ' + padRight('Patient Name', nameW) + ' ' +
    padRight('Email', emailW) + ' ' + padRight('Appts', cntW) + ' ' +
    padRight('Patient ID', idW)
  );
  console.log('-'.repeat(idxW + nameW + emailW + cntW + idW + 4));

  list.forEach((p, i) => {
    console.log(
      padRight(String(i + 1), idxW) + ' ' + padRight(p.name, nameW) + ' ' +
      padRight(p.email, emailW) + ' ' + padRight(String(p.appointmentCount), cntW) + ' ' +
      padRight(p.patientId, idW)
    );
  });
  console.log(`\nShowing ${list.length} patient(s) with appointments.`);
}
