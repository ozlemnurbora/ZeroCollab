import { supabase } from './supabase.js'

/**
 * Remote storage for project-scoped, team-shared Release Packages. Mirrors the
 * task/activity-log pattern: project_members-gated RLS, every call wrapped so it
 * never throws or blocks the UI.
 */

export function mapToRemote(pkg) {
  return {
    id: pkg.id,
    project_id: pkg.projectId,
    name: pkg.name,
    deploy_date: pkg.deployDate ?? null,
    epic_ids: pkg.epicIds ?? [],
  }
}

export function mapFromRemote(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    deployDate: row.deploy_date ?? null,
    epicIds: Array.isArray(row.epic_ids) ? row.epic_ids : [],
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  }
}

/** Fetch a project's release packages (oldest first). Returns [] on error/missing id. */
export async function fetchRemotePackages(projectId) {
  try {
    if (!projectId) return []
    const { data, error } = await supabase
      .from('release_packages')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('[ReleasePackageStorage] fetchRemotePackages error', error)
      return []
    }
    return (Array.isArray(data) ? data : []).map(mapFromRemote)
  } catch (err) {
    console.error('[ReleasePackageStorage] fetchRemotePackages exception', err)
    return []
  }
}

/** Insert/update a single package (create, epic assign/remove, date change). Never throws. */
export async function upsertRemotePackage(pkg) {
  try {
    if (!pkg || !pkg.projectId) return
    const { error } = await supabase
      .from('release_packages')
      .upsert({ ...mapToRemote(pkg), updated_at: new Date().toISOString() })
    if (error) console.error('[ReleasePackageStorage] upsertRemotePackage error', error)
  } catch (err) {
    console.error('[ReleasePackageStorage] upsertRemotePackage exception', err)
  }
}

/** Delete a package by id. Never throws. */
export async function deleteRemotePackage(pkgId) {
  try {
    if (!pkgId) return
    const { error } = await supabase.from('release_packages').delete().eq('id', pkgId)
    if (error) console.error('[ReleasePackageStorage] deleteRemotePackage error', error)
  } catch (err) {
    console.error('[ReleasePackageStorage] deleteRemotePackage exception', err)
  }
}
