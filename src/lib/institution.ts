export interface InstitutionLabels {
  senate: string
  unit: string
  units: string
  unitHead: string
  topOffice: string
}

const LABELS: Record<string, InstitutionLabels> = {
  university: {
    senate:    'Senate',
    unit:      'Faculty',
    units:     'Faculties',
    unitHead:  'Dean',
    topOffice: 'Vice Chancellor',
  },
  polytechnic: {
    senate:    'Academic Board',
    unit:      'School',
    units:     'Schools',
    unitHead:  'Director',
    topOffice: 'Rector',
  },
  college_of_education: {
    senate:    'Academic Board',
    unit:      'School',
    units:     'Schools',
    unitHead:  'Dean',
    topOffice: 'Provost',
  },
  monotechnic: {
    senate:    'Academic Board',
    unit:      'School',
    units:     'Schools',
    unitHead:  'Director',
    topOffice: 'Rector',
  },
}

const DEFAULT = LABELS.university

export function getInstitutionLabels(institutionType: string | null | undefined): InstitutionLabels {
  return LABELS[institutionType ?? ''] ?? DEFAULT
}
