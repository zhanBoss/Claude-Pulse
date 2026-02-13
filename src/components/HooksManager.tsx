/**
 * Claude Code Hooks 管理组件
 * 基于官方文档: https://docs.anthropic.com/en/docs/claude-code/hooks
 * 提供左右分栏: 左边表单 + 右边 JSON 代码预览
 */

import { useState, useEffect, useMemo } from 'react'
import {
  Space,
  Typography,
  Button,
  Empty,
  Tag,
  message,
  Form,
  Select,
  Input,
  InputNumber,
  Switch,
  Popconfirm,
  Tooltip,
  Radio
} from 'antd'
import {
  ApiOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  InfoCircleOutlined
} from '@ant-design/icons'
import { ClaudeHook } from '../types'
import { getThemeVars } from '../theme'
import { CLAUDE_HOOK_OPTIONS, generateHookJson } from '../constants/claudeHooks'
import ElectronModal from './ElectronModal'
import Editor from '@monaco-editor/react'

const { Text } = Typography

interface HooksManagerProps {
  darkMode: boolean
  onRefresh?: () => void
}

const HooksManager = (props: HooksManagerProps) => {
  const { darkMode, onRefresh } = props
  const themeVars = getThemeVars(darkMode)

  const [hooks, setHooks] = useState<ClaudeHook[]>([])
  const [modalVisible, setModalVisible] = useState(false)
  const [editingHook, setEditingHook] = useState<ClaudeHook | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [form] = Form.useForm()
  const formValues = Form.useWatch([], form)

  // 加载 Hooks
  const loadHooks = async () => {
    try {
      const result = await window.electronAPI.getClaudeHooks()
      if (result.success && result.hooks) {
        setHooks(result.hooks)
      }
    } catch {
      message.error('加载 Hooks 失败')
    }
  }

  useEffect(() => {
    loadHooks()
  }, [])

  // 实时生成 JSON 预览
  const jsonPreview = useMemo(() => {
    if (!formValues) return '{}'
    return generateHookJson({
      type: formValues.type,
      matcher: formValues.matcher,
      handlerType: formValues.handlerType,
      command: formValues.command,
      prompt: formValues.prompt,
      timeout: formValues.timeout,
      async: formValues.async
    })
  }, [formValues])

  // 新增/编辑 Hook
  const handleOpenModal = (hook?: ClaudeHook) => {
    if (hook) {
      setEditingHook(hook)
      form.setFieldsValue({
        type: hook.type,
        matcher: hook.matcher,
        handlerType: hook.handlerType || 'command',
        command: hook.command,
        prompt: hook.prompt,
        timeout: hook.timeout,
        async: hook.async
      })
    } else {
      setEditingHook(null)
      form.resetFields()
      form.setFieldsValue({ handlerType: 'command' })
    }
    setModalVisible(true)
  }

  const handleDelete = async (type: string) => {
    try {
      const result = await window.electronAPI.deleteClaudeHook(type)
      if (result.success) {
        message.success('删除成功')
        loadHooks()
        onRefresh?.()
      } else {
        message.error(result.error || '删除失败')
      }
    } catch {
      message.error('删除失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const result = await window.electronAPI.saveClaudeHook(values.type, {
        type: values.type,
        matcher: values.matcher || undefined,
        handlerType: values.handlerType || 'command',
        command: values.command || undefined,
        prompt: values.prompt || undefined,
        timeout: values.timeout || undefined,
        async: values.async || false,
        enabled: true
      })

      if (result.success) {
        message.success(editingHook ? '更新成功' : '创建成功')
        setModalVisible(false)
        form.resetFields()
        setEditingHook(null)
        loadHooks()
        onRefresh?.()
      } else {
        message.error(result.error || '保存失败')
      }
    } catch {
      // 表单验证失败
    } finally {
      setSubmitting(false)
    }
  }

  const getHookOption = (type: string) => CLAUDE_HOOK_OPTIONS.find(h => h.type === type)
  const usedHookTypes = hooks.map(h => h.type)

  /* 当前选中的 hook 类型 */
  const selectedHookOption = formValues?.type ? getHookOption(formValues.type) : null

  return (
    <div>
      {/* 工具栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          Hooks 在 Claude Code 生命周期的特定节点自动执行命令
        </Text>
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={() => handleOpenModal()}>
          新增
        </Button>
      </div>

      {/* Hooks 列表 */}
      {hooks.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<Text type="secondary" style={{ fontSize: 11 }}>暂无配置的 Hooks</Text>}
          style={{ margin: '12px 0' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {hooks.map(hook => {
            const hookOption = getHookOption(hook.type)
            return (
              <div
                key={hook.type}
                style={{
                  padding: '8px 10px',
                  border: `1px solid ${themeVars.border}`,
                  borderRadius: 6,
                  backgroundColor: themeVars.bgSection
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Space size={6}>
                      <ApiOutlined style={{ color: themeVars.primary, fontSize: 14 }} />
                      <Text strong style={{ fontSize: 12 }}>{hook.type}</Text>
                      {hook.matcher && (
                        <Tag style={{ fontSize: 10, padding: '0 4px' }}>{hook.matcher}</Tag>
                      )}
                      <Tag
                        color={hook.handlerType === 'prompt' ? 'blue' : hook.handlerType === 'agent' ? 'purple' : 'default'}
                        style={{ fontSize: 10, padding: '0 4px' }}
                      >
                        {hook.handlerType || 'command'}
                      </Tag>
                      {hookOption?.canBlock && (
                        <Tag color="orange" style={{ fontSize: 10, padding: '0 4px' }}>可阻止</Tag>
                      )}
                    </Space>
                    {hookOption && (
                      <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 2 }}>
                        {hookOption.description}
                      </Text>
                    )}
                    {hook.command && (
                      <Text
                        code
                        style={{
                          fontSize: 10,
                          backgroundColor: themeVars.codeBg,
                          padding: '1px 6px',
                          borderRadius: 3,
                          display: 'inline-block',
                          marginTop: 4,
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {hook.command}
                      </Text>
                    )}
                  </div>
                  <Space size={4} style={{ marginLeft: 8, flexShrink: 0 }}>
                    <Tooltip title="编辑">
                      <Button type="text" icon={<EditOutlined />} size="small" onClick={() => handleOpenModal(hook)} />
                    </Tooltip>
                    <Popconfirm
                      title="确定删除此 Hook？"
                      onConfirm={() => handleDelete(hook.type)}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <Tooltip title="删除">
                        <Button type="text" icon={<DeleteOutlined />} size="small" danger />
                      </Tooltip>
                    </Popconfirm>
                  </Space>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 新增/编辑 Hook Modal - 左右分栏 */}
      <ElectronModal
        title={<Space><ApiOutlined /><span>{editingHook ? '编辑 Hook' : '新增 Hook'}</span></Space>}
        open={modalVisible}
        onCancel={() => { setModalVisible(false); form.resetFields(); setEditingHook(null) }}
        width={720}
        style={{ top: 60 }}
        footer={[
          <Button key="cancel" onClick={() => { setModalVisible(false); form.resetFields(); setEditingHook(null) }}>
            取消
          </Button>,
          <Button key="save" type="primary" onClick={handleSubmit} loading={submitting}>
            保存
          </Button>
        ]}
      >
        <div style={{ display: 'flex', gap: 16, minHeight: 380 }}>
          {/* 左侧: 表单 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Form form={form} layout="vertical" size="small" initialValues={{ handlerType: 'command' }}>
              <Form.Item
                label="Hook 事件"
                name="type"
                rules={[{ required: true, message: '请选择' }]}
              >
                <Select
                  placeholder="选择事件"
                  disabled={!!editingHook}
                  showSearch
                  optionFilterProp="label"
                  options={CLAUDE_HOOK_OPTIONS.filter(
                    opt => !usedHookTypes.includes(opt.type) || opt.type === editingHook?.type
                  ).map(opt => ({
                    value: opt.type,
                    label: opt.type
                  }))}
                  optionRender={option => {
                    const hookOpt = CLAUDE_HOOK_OPTIONS.find(h => h.type === option.value)
                    return hookOpt ? (
                      <div style={{ padding: '2px 0' }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{hookOpt.type}</div>
                        <div style={{ fontSize: 11, color: themeVars.textSecondary, lineHeight: 1.3 }}>
                          {hookOpt.description}
                        </div>
                      </div>
                    ) : null
                  }}
                />
              </Form.Item>

              {/* 动态显示触发时机信息 */}
              {selectedHookOption && (
                <div
                  style={{
                    fontSize: 11,
                    color: themeVars.textSecondary,
                    background: themeVars.codeBg,
                    borderRadius: 4,
                    padding: '6px 8px',
                    marginBottom: 16,
                    marginTop: -8,
                    lineHeight: 1.5
                  }}
                >
                  <Space size={4} style={{ marginBottom: 2 }}>
                    <InfoCircleOutlined style={{ fontSize: 11 }} />
                    <span>触发时机: {selectedHookOption.triggerTiming}</span>
                  </Space>
                  {selectedHookOption.supportsMatcher && (
                    <div>Matcher: {selectedHookOption.matcherTarget}</div>
                  )}
                  {selectedHookOption.canBlock && (
                    <div style={{ color: '#fa8c16' }}>此事件支持阻止操作 (exit code 2)</div>
                  )}
                </div>
              )}

              {/* Matcher - 仅在支持时显示 */}
              {selectedHookOption?.supportsMatcher && (
                <Form.Item
                  label="Matcher (正则过滤)"
                  name="matcher"
                  extra={selectedHookOption.matcherTarget ? `可选值: ${selectedHookOption.matcherTarget}` : undefined}
                >
                  <Input placeholder="如: Bash, Edit|Write, mcp__.*" />
                </Form.Item>
              )}

              <Form.Item label="处理器类型" name="handlerType">
                <Radio.Group size="small">
                  <Radio.Button value="command">命令</Radio.Button>
                  <Radio.Button value="prompt">提示词</Radio.Button>
                  <Radio.Button value="agent">代理</Radio.Button>
                </Radio.Group>
              </Form.Item>

              {/* 根据 handlerType 动态渲染 */}
              <Form.Item noStyle shouldUpdate={(prev: Record<string, any>, cur: Record<string, any>) => prev.handlerType !== cur.handlerType}>
                {() => {
                  const handlerType = form.getFieldValue('handlerType')
                  if (handlerType === 'command' || !handlerType) {
                    return (
                      <>
                        <Form.Item
                          label="Shell 命令"
                          name="command"
                          rules={[{ required: true, message: '请输入命令' }]}
                        >
                          <Input.TextArea
                            rows={2}
                            placeholder='如: "$CLAUDE_PROJECT_DIR"/.claude/hooks/my-hook.sh'
                            style={{ fontFamily: 'monospace', fontSize: 12 }}
                          />
                        </Form.Item>
                        <Form.Item label="异步执行" name="async" valuePropName="checked">
                          <Switch size="small" />
                        </Form.Item>
                      </>
                    )
                  }
                  return (
                    <Form.Item
                      label="提示词"
                      name="prompt"
                      rules={[{ required: true, message: '请输入提示词' }]}
                      extra="使用 $ARGUMENTS 作为 hook 输入的占位符"
                    >
                      <Input.TextArea
                        rows={3}
                        placeholder="分析以下工具调用是否安全: $ARGUMENTS"
                        style={{ fontSize: 12 }}
                      />
                    </Form.Item>
                  )
                }}
              </Form.Item>

              <Form.Item label="超时时间 (秒)" name="timeout">
                <InputNumber min={1} max={3600} placeholder="默认: command=600, prompt=30" style={{ width: '100%' }} />
              </Form.Item>
            </Form>
          </div>

          {/* 右侧: JSON 代码预览 */}
          <div
            style={{
              width: 300,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: themeVars.textSecondary,
                marginBottom: 6,
                fontWeight: 500
              }}
            >
              settings.json 预览
            </div>
            <div
              style={{
                flex: 1,
                border: `1px solid ${themeVars.border}`,
                borderRadius: 6,
                overflow: 'hidden'
              }}
            >
              <Editor
                height="100%"
                defaultLanguage="json"
                value={jsonPreview}
                theme={darkMode ? 'vs-dark' : 'light'}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 11,
                  lineNumbers: 'off',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'on',
                  folding: false,
                  renderLineHighlight: 'none',
                  scrollbar: { vertical: 'hidden', horizontal: 'hidden' }
                }}
              />
            </div>
          </div>
        </div>
      </ElectronModal>
    </div>
  )
}

export default HooksManager
