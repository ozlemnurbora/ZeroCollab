export const ROLE_LABELS = {
  manager: { en: 'Manager', tr: 'Yönetici' },
  member: { en: 'Member', tr: 'Üye' },
}

export function getRoleLabel(role, lang = 'en') {
  return ROLE_LABELS[role]?.[lang] || role
}

