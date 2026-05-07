function normalizeKey(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const low = s.toLowerCase().replace(/[\s-]+/g, '_')
  if (low === 'task') return 'task'
  if (low === 'user_story' || low === 'userstory') return 'user_story'
  if (low === 'feature') return 'feature'
  if (low === 'epic') return 'epic'
  if (low === 'user') return null
  if (low === 'userstory') return 'user_story'
  if (low === 'user_story') return 'user_story'
  if (low === 'user_story') return 'user_story'
  if (low === 'user_story') return 'user_story'
  if (low === 'user_story') return 'user_story'
  // Handle title-cased values stored in `type`
  if (s === 'Task') return 'task'
  if (s === 'Epic') return 'epic'
  if (s === 'Feature') return 'feature'
  if (s === 'User Story') return 'user_story'
  return null
}

export function getAgileItemType(item) {
  const fromType = normalizeKey(item?.type)
  const fromItemType = normalizeKey(item?.itemType)
  const key = fromType ?? fromItemType ?? null
  const display =
    key === 'epic'
      ? 'Epic'
      : key === 'feature'
        ? 'Feature'
        : key === 'user_story'
          ? 'User Story'
          : key === 'task'
            ? 'Task'
            : null
  return { itemTypeKey: key, displayType: display }
}

