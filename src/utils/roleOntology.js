export const ROLE_LABELS = {
project_admin: { en: 'Project Admin', tr: 'Proje Yöneticisi' },
project_manager: { en: 'Project Manager', tr: 'Proje Müdürü' },
direct_member: { en: 'Direct Member', tr: 'Doğrudan Üye' },
team_member: { en: 'Team Member', tr: 'Takım Üyesi' },
team_admin: { en: 'Team Admin', tr: 'Takım Yöneticisi' },
team_manager: { en: 'Team Manager', tr: 'Takım Müdürü' },
manager: { en: 'Manager', tr: 'Yönetici' },
member: { en: 'Member', tr: 'Üye' },
}

export function getRoleLabel(role, lang = 'en') {
return ROLE_LABELS[role]?.[lang] || ROLE_LABELS[role]?.en || role || ''
}

export function isAdminRole(role) {
return role === 'project_admin' || role === 'team_admin'
}

export function isManagerRole(role) {
return role === 'project_manager' || role === 'team_manager' || role === 'manager'
}

export function normalizeProjectRole(role, memberSource, customRole) {
if (role === 'owner') return 'project_admin'
if (customRole === 'project_manager') return 'project_manager'
if (role === 'project_manager') return 'project_manager'
if (memberSource === 'team') return 'team_member'
if (memberSource === 'direct') return 'direct_member'
return 'direct_member'
}

export function normalizeTeamRole(role, isOwner = false, customRole) {
if (isOwner) return 'team_admin'
if (customRole === 'team_manager') return 'team_manager'
if (role === 'team_manager') return 'team_manager'
return 'team_member'
}

export function getRoleBadgeClass(role) {
if (role === 'project_admin' || role === 'team_admin') {
return 'bg-purple-500/20 text-purple-300 ring-purple-500/30'
}
if (role === 'project_manager' || role === 'team_manager' || role === 'manager') {
return 'bg-amber-500/20 text-amber-300 ring-amber-500/30'
}
if (role === 'direct_member') {
return 'bg-blue-500/15 text-blue-300 ring-blue-500/25'
}
return 'bg-slate-500/20 text-slate-300 ring-slate-500/25'
}
