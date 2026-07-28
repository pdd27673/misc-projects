/**
 * Illustrative data, used only when the live fetch fails.
 *
 * Responses built from this are flagged `sample: true` and the UI shows a
 * banner, so it is never mistaken for real availability. It exists so the
 * page still demonstrates search, filtering and the planner when CSUN is
 * unreachable.
 */

import { makeMeeting } from './normalize';
import type { Section } from './types';

function section(
  course: string,
  classNumber: string,
  sec: string,
  title: string,
  status: Section['status'],
  seats: number,
  capacity: number,
  days: string,
  start: number | null,
  end: number | null,
  room: string,
  mode: string,
  instructor: string,
): Section {
  const [subject, catalogNumber] = course.split(' ') as [string, string];
  const dayCodes = days ? (days.match(/.{2}/g) as Section['meetings'][number]['days']) : [];
  return {
    course,
    subject,
    catalogNumber,
    classNumber,
    section: sec,
    title,
    status,
    seatsAvailable: seats,
    seatsCapacity: capacity,
    waitlistAvailable: status === 'waitlist' ? 3 : 10,
    units: 3,
    instructionMode: mode,
    instructors: [instructor],
    meetings: [makeMeeting(dayCodes, start, end, room)],
    session: 'Regular',
  };
}

const H = (hour: number, minute = 0) => hour * 60 + minute;

export const SAMPLE_SECTIONS: Section[] = [
  section('COMP 586', '12345', '01', 'Advanced Topics in Software Engineering', 'open', 8, 30,
    'TuTh', H(19), H(20, 15), 'JD 1600', 'In Person', 'Rivera, A.'),
  section('COMP 586', '12346', '02', 'Advanced Topics in Software Engineering', 'closed', 0, 30,
    'MoWe', H(16), H(17, 15), 'JD 1620', 'In Person', 'Chen, L.'),
  section('COMP 586', '12347', '03', 'Advanced Topics in Software Engineering', 'waitlist', 0, 35,
    '', null, null, 'Online', 'Online (Asynchronous)', 'Staff'),

  section('COMP 620', '13001', '01', 'Advanced Algorithms', 'open', 12, 30,
    'TuTh', H(19), H(20, 15), 'JD 1600', 'In Person', 'Okafor, N.'),
  section('COMP 620', '13002', '02', 'Advanced Algorithms', 'open', 5, 30,
    'MoWe', H(18, 30), H(19, 45), 'JD 1610', 'In Person', 'Okafor, N.'),

  section('COMP 680', '13500', '01', 'Topics in Software Engineering', 'open', 4, 25,
    'MoWe', H(19), H(20, 15), 'JD 1630', 'In Person', 'Delgado, R.'),
  section('COMP 680', '13501', '02', 'Topics in Software Engineering', 'closed', 0, 25,
    'TuTh', H(16), H(17, 15), 'JD 1630', 'In Person', 'Delgado, R.'),

  section('MATH 150A', '20100', '05', 'Calculus I', 'open', 3, 40,
    'MoWeFr', H(9), H(9, 50), 'LO 1234', 'In Person', 'Park, S.'),
  section('MATH 150A', '20101', '06', 'Calculus I', 'closed', 0, 40,
    'TuTh', H(13), H(14, 15), 'LO 1240', 'In Person', 'Park, S.'),
];

export function sampleFor(subject: string | null, catalogNumber: string | null, classNumber: string | null): Section[] {
  return SAMPLE_SECTIONS.filter((item) => {
    if (classNumber && item.classNumber !== classNumber) return false;
    if (subject && item.subject !== subject.toUpperCase()) return false;
    if (catalogNumber && item.catalogNumber !== catalogNumber.toUpperCase()) return false;
    return true;
  });
}
