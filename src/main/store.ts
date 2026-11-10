/**
 * 프로젝트 저장: 프로젝트마다 JSON 파일 1개 (%APPDATA%/FuSaTrace/projects/<id>.json)
 * 저장은 임시 파일에 쓴 뒤 바꿔치기 → 저장 중 꺼져도 이전 파일이 남는다 (SPEC §3, §11)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Project, ProjectSummary } from '../core/model'
import { newProject } from '../core/project'

export class ProjectStore {
  readonly projectsDir: string
  private readonly settingsFile: string

  constructor(readonly dataDir: string) {
    this.projectsDir = join(dataDir, 'projects')
    this.settingsFile = join(dataDir, 'settings.json')
    mkdirSync(this.projectsDir, { recursive: true })
  }

  private fileOf(id: string): string {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('잘못된 프로젝트 ID')
    return join(this.projectsDir, `${id}.json`)
  }

  list(): ProjectSummary[] {
    const out: ProjectSummary[] = []
    for (const f of readdirSync(this.projectsDir)) {
      if (!f.endsWith('.json')) continue
      try {
        const p = JSON.parse(readFileSync(join(this.projectsDir, f), 'utf-8')) as Project
        out.push({ id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt })
      } catch {
        // 깨진 파일은 목록에서 빼고 넘어감
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  create(name: string): Project {
    const now = new Date().toISOString()
    const p = newProject(randomUUID(), name || '새 프로젝트', now)
    this.save(p)
    this.setLast(p.id)
    return p
  }

  load(id: string): Project | null {
    const file = this.fileOf(id)
    if (!existsSync(file)) return null
    const p = JSON.parse(readFileSync(file, 'utf-8')) as Project
    if (p.schema !== 1) throw new Error('지원하지 않는 프로젝트 파일 형식')
    // 이후 버전에서 추가된 칸 기본값
    p.settings ??= { milestones: [] }
    p.settings.milestones ??= []
    p.aliases ??= []
    p.docLinks ??= []
    p.vrOverrides ??= {}
    return p
  }

  save(p: Project): void {
    const file = this.fileOf(p.id)
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(p), 'utf-8')
    renameSync(tmp, file)
  }

  remove(id: string): void {
    rmSync(this.fileOf(id), { force: true })
  }

  last(): string | undefined {
    try {
      return (JSON.parse(readFileSync(this.settingsFile, 'utf-8')) as { lastProjectId?: string }).lastProjectId
    } catch {
      return undefined
    }
  }

  setLast(id: string): void {
    const tmp = `${this.settingsFile}.tmp`
    writeFileSync(tmp, JSON.stringify({ lastProjectId: id }), 'utf-8')
    renameSync(tmp, this.settingsFile)
  }
}
