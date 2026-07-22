import { useState, useEffect, type CSSProperties } from 'react'
import { useI18n } from '../lib/i18n'
import { asArray } from '../lib/bamboo-build'
import LoadingSpinner from './LoadingSpinner'
import ScriptCodeEditor from './ScriptCodeEditor'
import { ExternalLink, Save, Check, ChevronRight } from 'lucide-react'

function taskLabel(task: any, index: number): string {
  return task.name || task.description || task.userDescription || `Task ${index + 1}`
}

function taskSubtitle(task: any): string {
  const name = task.name || ''
  const description = task.description || task.userDescription || ''
  if (description && description !== name && !name.includes(description)) return description
  return ''
}

const FIELD_I18N_KEYS: Record<string, string> = {
  userDescription: 'build.plan_config.field.description',
  scriptLocation: 'build.plan_config.field.script_location',
  interpreter: 'build.plan_config.field.interpreter',
  scriptBody: 'build.plan_config.field.script_body',
  script: 'build.plan_config.field.script_file',
  argument: 'build.plan_config.field.argument',
  environmentVariables: 'build.plan_config.field.env',
  workingSubDirectory: 'build.plan_config.field.workdir',
  commandLine: 'build.plan_config.field.command',
  command: 'build.plan_config.field.command',
  executable: 'build.plan_config.field.executable',
  selectedRepository: 'build.plan_config.field.repository',
  repositoryKey: 'build.plan_config.field.repository',
  checkoutDir: 'build.plan_config.field.checkout_dir',
  checkoutDirectory: 'build.plan_config.field.checkout_dir',
  cleanCheckout: 'build.plan_config.field.clean_checkout',
  taskDisabled: 'build.plan_config.field.disabled',
  runtime: 'build.plan_config.field.runtime',
  isolatedCache: 'build.plan_config.field.isolated_cache',
  selectFields: 'build.plan_config.field.select_fields',
  nodeExecutable: 'build.plan_config.field.node_executable',
  npmExecutable: 'build.plan_config.field.npm_executable',
  workingDirectory: 'build.plan_config.field.workdir',
  environment: 'build.plan_config.field.env',
  forceCleanBuild: 'build.plan_config.field.clean_checkout',
  host: 'build.plan_config.field.host',
  username: 'build.plan_config.field.username',
  password: 'build.plan_config.field.password',
  passphrase: 'build.plan_config.field.passphrase',
  privateKey: 'build.plan_config.field.private_key',
  localPath: 'build.plan_config.field.local_path',
  remotePath: 'build.plan_config.field.remote_path',
}

function fieldLabel(key: string, t: (key: string) => string): string {
  const i18nKey = FIELD_I18N_KEYS[key] || `build.plan_config.field.${key}`
  const translated = t(i18nKey)
  if (translated !== i18nKey) return translated
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (char) => char.toUpperCase())
}

function asTaskList(job: any): any[] {
  return asArray(job.tasks?.task ?? job.tasks ?? [])
}

type FieldMeta = {
  key: string
  type: 'text' | 'textarea' | 'select' | 'checkbox'
  options?: { value: string; label: string }[]
}

const selectStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 36px 8px 10px',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  boxShadow: 'var(--ring-border)',
  backgroundColor: 'var(--bg-page)',
  color: 'var(--text-primary)',
  fontSize: 13,
  fontFamily: 'inherit',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="%238a8f98" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  )}")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  backgroundSize: '12px',
}

export default function PlanTaskConfig({ planKey }: { planKey: string }) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stages, setStages] = useState<any[]>([])
  const [expandedStage, setExpandedStage] = useState<number | null>(0)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ jobKey: string; taskId: string; label: string } | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [fieldMeta, setFieldMeta] = useState<FieldMeta[]>([])
  const [taskDisabled, setTaskDisabled] = useState(false)
  const [configLoading, setConfigLoading] = useState(false)
  const [configError, setConfigError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const plan = await window.bamboo.getPlanDetail(planKey)
        if (cancelled) return
        if (!plan) {
          setError(t('build.plan_config.load_failed'))
          setStages([])
          return
        }
        const parsedStages = asArray(plan.stages?.stage ?? [])
        setStages(parsedStages)
        const firstStageJobs = asArray(parsedStages[0]?.jobs?.job ?? parsedStages[0]?.plans?.plan ?? [])
        const firstJobKey = firstStageJobs[0]?.key || firstStageJobs[0]?.planKey?.key
        if (firstJobKey) setExpandedJob(`0-${firstJobKey}`)
        else if (firstStageJobs.length > 0) setExpandedJob('0-0')
      } catch {
        if (!cancelled) setError(t('build.plan_config.load_failed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [planKey, t])

  async function openEditor(jobKey: string, task: any, index: number) {
    const taskId = String(task.id ?? '')
    if (!taskId) return
    setEditing({ jobKey, taskId, label: taskLabel(task, index) })
    setConfigLoading(true)
    setConfigError('')
    setSaved(false)
    setFields({})
    setFieldMeta([])
    try {
      const config = await window.bamboo.getPlanTaskConfig(jobKey, taskId)
      if (!config.ok) {
        setConfigError(config.errorMessage || t('build.plan_config.load_task_failed'))
        return
      }
      setFields({ ...config.fields })
      setFieldMeta(config.fieldMeta || [])
      setTaskDisabled(config.checkboxes.taskDisabled === true || config.fields.taskDisabled === 'true')
    } catch (err: any) {
      setConfigError(err?.message || t('build.plan_config.load_task_failed'))
    } finally {
      setConfigLoading(false)
    }
  }

  async function handleSave() {
    if (!editing || saving) return
    setSaving(true)
    setConfigError('')
    setSaved(false)
    try {
      const updates: Record<string, string | boolean> = { ...fields, taskDisabled }
      const result = await window.bamboo.updatePlanTask(editing.jobKey, editing.taskId, updates)
      if (!result.success) {
        setConfigError(result.errorMessage || t('build.plan_config.save_failed'))
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      const refreshed = await window.bamboo.getPlanTaskConfig(editing.jobKey, editing.taskId)
      if (refreshed.ok) {
        setFields({ ...refreshed.fields })
        setFieldMeta(refreshed.fieldMeta || [])
        setTaskDisabled(refreshed.checkboxes.taskDisabled === true || refreshed.fields.taskDisabled === 'true')
      }
    } catch (err: any) {
      setConfigError(err?.message || t('build.plan_config.save_failed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <LoadingSpinner />
      </div>
    )
  }

  if (error) {
    return <div style={{ fontSize: 13, color: 'var(--error, #ef4444)' }}>{error}</div>
  }

  if (!stages.length) {
    return <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{t('build.plan_config.empty')}</div>
  }

  const editorFields: FieldMeta[] = (fieldMeta.length > 0
    ? fieldMeta
    : Object.keys(fields).filter((key) => key !== 'taskDisabled').map((key) => ({
      key,
      type: (fields[key]?.includes('\n') ? 'textarea' : 'text') as FieldMeta['type'],
      options: undefined as { value: string; label: string }[] | undefined,
    }))
  ).filter((meta) => meta.key !== 'taskDisabled')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--text-quaternary)' }}>{t('build.plan_config.hint')}</div>
        <button
          className="btn-ghost"
          onClick={() => void window.actions.openUrl(`/chain/admin/config/defaultStages.action?buildKey=${encodeURIComponent(planKey)}`)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
        >
          <ExternalLink size={12} />
          {t('build.plan_config.open_bamboo')}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: editing ? 'minmax(0, 1fr) minmax(320px, 1.1fr)' : '1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {stages.map((stage, stageIndex) => {
            const jobs = asArray(stage.jobs?.job ?? stage.plans?.plan ?? [])
            const stageOpen = expandedStage === stageIndex
            return (
              <div key={stage.id ?? stageIndex} className="card-surface" style={{ padding: '14px 18px' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                  onClick={() => setExpandedStage(stageOpen ? null : stageIndex)}
                >
                  <ChevronRight size={14} style={{ transform: stageOpen ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s', color: 'var(--text-quaternary)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="truncate" style={{ fontSize: 14, fontWeight: 510, color: 'var(--text-primary)' }}>
                      {stage.name || `Stage ${stageIndex + 1}`}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginTop: 2 }}>
                      {t('build.job_count').replace('{count}', String(jobs.length))}
                    </div>
                  </div>
                </div>
                {stageOpen && jobs.map((job: any, jobIndex: number) => {
                  const jobKey = job.key || job.planKey?.key || ''
                  const jobId = `${stageIndex}-${jobKey || jobIndex}`
                  const jobOpen = expandedJob === jobId
                  const tasks = asTaskList(job)
                  return (
                    <div key={jobId} style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: jobOpen ? 8 : 0 }}
                        onClick={() => setExpandedJob(jobOpen ? null : jobId)}
                      >
                        <ChevronRight size={12} style={{ transform: jobOpen ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s', color: 'var(--text-quaternary)' }} />
                        <span className="truncate" style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
                          {job.name || t('build.job_fallback').replace('{index}', String(jobIndex + 1))}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-quaternary)' }}>
                          {t('build.plan_config.task_count').replace('{count}', String(tasks.length))}
                        </span>
                      </div>
                      {jobOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 510, color: 'var(--text-primary)',
                            padding: '4px 0 8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 4,
                          }}>
                            {t('build.plan_config.tasks_heading')}
                          </div>
                          {tasks.length === 0 && (
                            <div style={{ fontSize: 12, color: 'var(--text-quaternary)' }}>{t('build.plan_config.no_tasks')}</div>
                          )}
                          {tasks.map((task: any, taskIndex: number) => {
                            const selected = editing?.jobKey === jobKey && editing?.taskId === String(task.id)
                            const subtitle = taskSubtitle(task)
                            const disabled = task.isEnabled === false
                            return (
                              <button
                                key={task.id ?? taskIndex}
                                type="button"
                                onClick={() => {
                                  if (!jobKey || !task.id) return
                                  void openEditor(jobKey, task, taskIndex)
                                }}
                                style={{
                                  display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left',
                                  padding: '10px 12px', borderRadius: 'var(--radius-md)', border: 'none',
                                  background: selected ? 'var(--bg-elevated)' : 'var(--bg-page)',
                                  boxShadow: selected ? 'var(--ring-border)' : '0 0 0 1px var(--border-subtle)',
                                  color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'inherit',
                                  cursor: 'pointer', marginBottom: 6,
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="truncate" style={{ fontSize: 13, fontWeight: 510, color: 'var(--text-primary)' }}>
                                      {taskLabel(task, taskIndex)}
                                    </span>
                                    {disabled && (
                                      <span style={{
                                        fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                                        color: 'var(--text-quaternary)', background: 'var(--bg-elevated)',
                                        padding: '1px 6px', borderRadius: 4, flexShrink: 0,
                                      }}>
                                        {t('build.plan_config.disabled_badge')}
                                      </span>
                                    )}
                                  </div>
                                  {subtitle && (
                                    <div className="truncate" style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                      {subtitle}
                                    </div>
                                  )}
                                </div>
                                <span style={{ fontSize: 11, color: 'var(--accent)', flexShrink: 0, marginTop: 2 }}>
                                  {t('build.plan_config.editable')}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {editing && (
          <div className="card-surface" style={{ padding: 16, position: 'sticky', top: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 510, color: 'var(--text-primary)', marginBottom: 4 }}>
              {editing.label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-quaternary)', marginBottom: 14, fontFamily: 'monospace' }}>
              {editing.jobKey} · #{editing.taskId}
            </div>
            {configLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <LoadingSpinner />
              </div>
            ) : (
              <>
                {configError && (
                  <div style={{
                    marginBottom: 12, padding: '8px 10px', borderRadius: 'var(--radius-md)',
                    background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error, #ef4444)', fontSize: 12,
                  }}>
                    {configError}
                  </div>
                )}
                {editorFields.length === 0 && !configError && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
                    {t('build.plan_config.no_fields')}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {editorFields.map((meta) => (
                    <label key={meta.key} style={{ display: 'block' }}>
                      {meta.type === 'checkbox' ? (
                        <span style={{
                          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                          color: 'var(--text-secondary)', cursor: 'pointer',
                        }}>
                          <input
                            type="checkbox"
                            checked={fields[meta.key] === 'true' || fields[meta.key] === 'on'}
                            onChange={(e) => setFields((prev) => ({
                              ...prev,
                              [meta.key]: e.target.checked ? 'true' : 'false',
                            }))}
                            style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                          />
                          {fieldLabel(meta.key, t)}
                        </span>
                      ) : (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                            {fieldLabel(meta.key, t)}
                          </div>
                          {meta.type === 'select' ? (
                            <select
                              value={fields[meta.key] ?? ''}
                              onChange={(e) => setFields((prev) => ({ ...prev, [meta.key]: e.target.value }))}
                              style={selectStyle}
                            >
                              {(meta.options || []).map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          ) : meta.key === 'scriptBody' ? (
                            <ScriptCodeEditor
                              value={fields[meta.key] ?? ''}
                              onChange={(next) => setFields((prev) => ({ ...prev, [meta.key]: next }))}
                              rows={12}
                            />
                          ) : meta.type === 'textarea' ? (
                            <textarea
                              value={fields[meta.key] ?? ''}
                              onChange={(e) => setFields((prev) => ({ ...prev, [meta.key]: e.target.value }))}
                              rows={4}
                              style={{
                                width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                                borderRadius: 'var(--radius-md)', border: 'none', boxShadow: 'var(--ring-border)',
                                background: 'var(--bg-page)', color: 'var(--text-primary)',
                                fontSize: 12, fontFamily: 'ui-monospace, monospace', resize: 'vertical', lineHeight: 1.45,
                              }}
                            />
                          ) : (
                            <input
                              value={fields[meta.key] ?? ''}
                              onChange={(e) => setFields((prev) => ({ ...prev, [meta.key]: e.target.value }))}
                              style={{
                                width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                                borderRadius: 'var(--radius-md)', border: 'none', boxShadow: 'var(--ring-border)',
                                background: 'var(--bg-page)', color: 'var(--text-primary)',
                                fontSize: 13, fontFamily: 'inherit',
                              }}
                            />
                          )}
                        </>
                      )}
                    </label>
                  ))}
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                    color: 'var(--text-secondary)', cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={taskDisabled}
                      onChange={(e) => setTaskDisabled(e.target.checked)}
                      style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
                    />
                    {t('build.plan_config.field.disabled')}
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
                  <button
                    className="btn-primary"
                    onClick={() => void handleSave()}
                    disabled={saving || editorFields.length === 0}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Save size={14} />
                    {saving ? t('build.plan_config.saving') : t('build.plan_config.save')}
                  </button>
                  {saved && (
                    <span style={{ fontSize: 12, color: 'var(--success-emerald)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Check size={14} />
                      {t('build.plan_config.saved')}
                    </span>
                  )}
                  <button
                    className="btn-ghost"
                    onClick={() => setEditing(null)}
                    style={{ marginLeft: 'auto' }}
                  >
                    {t('build.plan_config.close')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
