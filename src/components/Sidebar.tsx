import { Menu } from "antd";
import { useState, useEffect, useRef } from "react";
import {
  ThunderboltOutlined,
  ClockCircleOutlined,
  StarOutlined,
  CommentOutlined,
  SettingOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { getThemeVars } from "../theme";

interface SidebarProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  darkMode: boolean;
  /** 是否在 Drawer 中渲染（移动端），不需要 macOS 安全区处理 */
  inDrawer?: boolean;
}

/* macOS hiddenInset 模式下交通灯高度 */
const TRAFFIC_LIGHT_HEIGHT = 38;
/* 侧边栏自动收起延迟时间（毫秒） */
const AUTO_COLLAPSE_DELAY = 3000;
/* 侧边栏宽度 */
const SIDEBAR_WIDTH_EXPANDED = 200;
const SIDEBAR_WIDTH_COLLAPSED = 60;

const Sidebar = (props: SidebarProps) => {
  const { currentRoute, onNavigate, darkMode, inDrawer = false } = props;
  const themeVars = getThemeVars(darkMode);

  // 侧边栏展开/收起状态（仅桌面端生效）
  const [collapsed, setCollapsed] = useState(false);
  const collapseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 鼠标进入侧边栏：展开
  const handleMouseEnter = () => {
    if (inDrawer) return; // 移动端不处理
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
    setCollapsed(false);
  };

  // 鼠标离开侧边栏：3秒后收起
  const handleMouseLeave = () => {
    if (inDrawer) return; // 移动端不处理
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current);
    }
    collapseTimerRef.current = setTimeout(() => {
      setCollapsed(true);
    }, AUTO_COLLAPSE_DELAY);
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current);
      }
    };
  }, []);

  const menuItems = [
    {
      key: "realtime",
      icon: <ThunderboltOutlined />,
      label: "实时对话",
    },
    {
      key: "history",
      icon: <ClockCircleOutlined />,
      label: "历史记录",
    },
    {
      key: "prompts",
      icon: <StarOutlined />,
      label: "常用Prompt",
    },
    {
      key: "chat",
      icon: <CommentOutlined />,
      label: "AI 助手",
    },
    {
      key: "settings",
      icon: <SettingOutlined />,
      label: "应用设置",
    },
    {
      key: "changelog",
      icon: <FileTextOutlined />,
      label: "更新日志",
    },
    {
      key: "about",
      icon: <InfoCircleOutlined />,
      label: "关于",
    },
  ];

  return (
    <div
      style={{
        width: inDrawer ? 200 : collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
        height: inDrawer ? "100%" : "100vh",
        background: themeVars.bgContainer,
        borderRight: inDrawer
          ? "none"
          : `1px solid ${themeVars.borderSecondary}`,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
        transition: "width 0.3s ease",
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 顶部区域：交通灯 + Logo 同行，Logo 避开交通灯 */}
      {/* macOS 交通灯是窗口级的，Drawer 弹出层也会被遮挡，统一右对齐 */}
      <div
        style={
          {
            height: TRAFFIC_LIGHT_HEIGHT,
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed && !inDrawer ? "center" : "flex-end",
            paddingRight: collapsed && !inDrawer ? 0 : 24,
            fontSize: 18,
            fontWeight: 600,
            fontFamily: "Fira Code, monospace",
            color: themeVars.primary,
            flexShrink: 0,
            overflow: "hidden",
            transition: "all 0.3s ease",
            ...(inDrawer ? {} : { WebkitAppRegion: "drag" as const }),
          } as React.CSSProperties
        }
      >
        {(!collapsed || inDrawer) && "CCMonitor"}
        {collapsed && !inDrawer && "CC"}
      </div>

      {/* 分割线 */}
      <div
        style={{
          height: 1,
          flexShrink: 0,
          background: themeVars.borderSecondary,
          margin: "0 16px",
        }}
      />

      {/* 导航菜单 - 占满剩余空间，仅超出时滚动 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          paddingTop: 4,
        }}
      >
        <Menu
          mode="inline"
          selectedKeys={[currentRoute]}
          onClick={({ key }) => onNavigate(key)}
          items={menuItems}
          inlineCollapsed={collapsed && !inDrawer}
          style={{
            border: "none",
            background: "transparent",
          }}
        />
      </div>
    </div>
  );
};

export default Sidebar;
