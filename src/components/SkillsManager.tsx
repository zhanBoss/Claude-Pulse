/**
 * Claude Code Skills 管理组件
 * 提供 Skills 的查看、新增、删除功能
 */

import { useState, useEffect } from 'react'
import {
  Space,
  Typography,
  Button,
  Empty,
  Tag,
  Tooltip,
  message,
  Modal,
  Form,
  Input,
  Popconfirm,
  Spin
} from 'antd'
import {
  ThunderboltOutlined,
  CopyOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  DeleteOutlined
} from '@ant-design/icons'
import { ClaudeSkill } from '../types'
import { getThemeVars } from '../theme'

const { Text, Paragraph } = Typography
const { TextArea } = Input

interface SkillsManagerProps {
  darkMode: boolean
  onRefresh?: () => void
}

const SkillsManager = (props: SkillsManagerProps) => {
  const { darkMode, onRefresh } = props
  const themeVars = getThemeVars(darkMode)

  const [skills, setSkills] = useState<ClaudeSkill[]>([])
  const [loading, setLoading] = useState(false)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [createForm] = Form.useForm()

  // 加载 Skills
  const loadSkills = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.getClaudeSkills()
      if (result.success && result.skills) {
        setSkills(result.skills)
      }
    } catch (error) {
      message.error('加载 Skills 失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSkills()
  }, [])

  // 删除 Skill
  const handleDelete = async (name: string) => {
    try {
      const result = await window.electronAPI.deleteClaudeSkill(name)
      if (result.success) {
        message.success('删除成功')
        loadSkills()
        onRefresh?.()
      } else {
        message.error(result.error || '删除失败')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  // 创建新 Skill
  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields()
      setSubmitting(true)

      const result = await window.electronAPI.createClaudeSkill(values.name, values.description)

      if (result.success) {
        message.success('创建成功')
        setCreateModalVisible(false)
        createForm.resetFields()
        loadSkills()
        onRefresh?.()

        // 询问是否打开文件夹
        if (result.skillPath) {
          Modal.confirm({
            title: '创建成功',
            content: '是否立即打开 Skill 文件夹进行编辑?',
            okText: '打开',
            cancelText: '稍后',
            onOk: () => {
              window.electronAPI.openInFinder(result.skillPath!)
            }
          })
        }
      } else {
        message.error(result.error || '创建失败')
      }
    } catch (error) {
      // 表单验证失败
    } finally {
      setSubmitting(false)
    }
  }

  // 复制路径
  const copyToClipboard = async (text: string) => {
    await window.electronAPI.copyToClipboard(text)
    message.success('已复制')
  }

  return (
    <div>
      {/* 工具栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12
        }}
      >
        <Text type="secondary" style={{ fontSize: 11 }}>
          Skills 为 Claude Code 提供专业领域知识
        </Text>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="small"
          onClick={() => setCreateModalVisible(true)}
        >
          新增 Skill
        </Button>
      </div>

      {/* Skills 列表 */}
      <Spin spinning={loading}>
      {skills.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<Text type="secondary" style={{ fontSize: 11 }}>暂无已安装的 Skills</Text>}
          style={{ margin: '12px 0' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {skills.map(skill => (
            <div
              key={skill.name}
              style={{
                padding: '8px 10px',
                border: `1px solid ${themeVars.border}`,
                borderRadius: 6,
                backgroundColor: themeVars.bgSection
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <Space size={6}>
                  <ThunderboltOutlined style={{ color: '#52c41a', fontSize: 14 }} />
                  <Text strong style={{ fontSize: 12 }}>
                    {skill.name}
                  </Text>
                  <Tag style={{ fontSize: 10, padding: '0 4px' }}>{skill.files.length} 文件</Tag>
                </Space>
                <Space size={4}>
                  <Tooltip title="复制路径">
                    <Button
                      type="text"
                      icon={<CopyOutlined />}
                      size="small"
                      onClick={() => copyToClipboard(skill.path)}
                    />
                  </Tooltip>
                  <Tooltip title="打开文件夹">
                    <Button
                      type="text"
                      icon={<FolderOpenOutlined />}
                      size="small"
                      onClick={() => window.electronAPI.openInFinder(skill.path)}
                    />
                  </Tooltip>
                  <Popconfirm
                    title="确定删除此 Skill？"
                    description="将删除整个 Skill 文件夹，此操作不可恢复"
                    onConfirm={() => handleDelete(skill.name)}
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
              {skill.description && (
                <Text
                  type="secondary"
                  style={{ fontSize: 10, display: 'block', marginTop: 4 }}
                  ellipsis
                >
                  {skill.description}
                </Text>
              )}
            </div>
          ))}
        </div>
      )}
      </Spin>

      {/* 创建 Skill Modal */}
      <Modal
        title={
          <Space>
            <ThunderboltOutlined />
            <span>新增 Skill</span>
          </Space>
        }
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false)
          createForm.resetFields()
        }}
        onOk={handleCreate}
        confirmLoading={submitting}
        width={500}
      >
        <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 16 }}>
          Skill 会在 <Text code>~/.claude/skills/</Text> 目录下创建文件夹，包含 SKILL.md 文件
        </Paragraph>
        <Form form={createForm} layout="vertical">
          <Form.Item
            label="Skill 名称"
            name="name"
            rules={[
              { required: true, message: '请输入 Skill 名称' },
              {
                pattern: /^[a-zA-Z0-9_-]+$/,
                message: '只能包含字母、数字、下划线和连字符'
              }
            ]}
            extra="例如: react-best-practices, python-async-guide"
          >
            <Input placeholder="react-best-practices" />
          </Form.Item>
          <Form.Item
            label="描述"
            name="description"
            rules={[{ required: true, message: '请输入描述' }]}
            extra="简短描述此 Skill 的用途和功能"
          >
            <TextArea
              rows={3}
              placeholder="React 开发最佳实践指南，包含 Hooks 使用、性能优化等内容"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default SkillsManager
