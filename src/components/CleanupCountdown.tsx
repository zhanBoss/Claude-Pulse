import { useState, useEffect, useRef, useCallback } from "react";
import { message } from "antd";
import { getThemeVars } from "../theme";
import logoRounded from "../assets/logo/logo-rounded.png";

interface CleanupCountdownProps {
  darkMode: boolean;
}

/**
 * 格式化剩余时间为可读字符串
 */
const formatRemainingTime = (ms: number): string => {
  if (ms <= 0) return "即将执行";

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}时`);
  if (minutes > 0) parts.push(`${minutes}分`);
  parts.push(`${seconds}秒`);

  return parts.join("");
};

const CleanupCountdown = (props: CleanupCountdownProps) => {
  const { darkMode } = props;
  const themeVars = getThemeVars(darkMode);

  // 组件状态
  const [enabled, setEnabled] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false); // hover 状态
  const [contentWidth, setContentWidth] = useState(0); // 内容宽度
  const textRef = useRef<HTMLSpanElement>(null); // 文字引用，用于测量宽度

  // 拖拽状态
  const [position, setPosition] = useState({ x: 20, y: 20 }); // 距离右下角的距离
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const hasDraggedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 初始化：获取自动清理状态
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const status = await window.electronAPI.getAutoCleanupStatus();
        setEnabled(status.enabled);
        if (status.remainingMs !== null) {
          setRemainingMs(status.remainingMs);
        }
      } catch (error) {
        console.error("获取自动清理状态失败:", error);
      }
    };
    loadStatus();
  }, []);

  // 监听倒计时更新
  useEffect(() => {
    const cleanupTick = window.electronAPI.onAutoCleanupTick((data) => {
      setEnabled(true);
      setRemainingMs(data.remainingMs);
    });

    const cleanupExecuted = window.electronAPI.onAutoCleanupExecuted((data) => {
      message.success(`自动清理完成，删除了 ${data.deletedCount} 条记录`);
      // 清除后重置状态
      setIsHovered(false);
      // 重新计算剩余时间
      const remaining = data.nextCleanupTime - Date.now();
      setRemainingMs(remaining > 0 ? remaining : null);
    });

    return () => {
      cleanupTick();
      cleanupExecuted();
    };
  }, []);

  // 监听设置变化（通过定时轮询）
  useEffect(() => {
    const checkInterval = setInterval(async () => {
      try {
        const status = await window.electronAPI.getAutoCleanupStatus();
        setEnabled(status.enabled);
        if (!status.enabled) {
          setRemainingMs(null);
        }
      } catch {
        // 忽略错误
      }
    }, 5000);

    return () => clearInterval(checkInterval);
  }, []);

  // 测量内容宽度
  useEffect(() => {
    if (textRef.current) {
      // 测量文字 + 小圆点 + gap + padding
      const textWidth = textRef.current.offsetWidth;
      // 6 (小圆点) + 8 (gap) + textWidth + 8 (左padding) + 40 (右侧图标区域) + 8 (右padding)
      setContentWidth(6 + 8 + textWidth + 8 + 40 + 8);
    }
  }, [remainingMs]);

  // 拖拽逻辑
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // 不阻止默认行为，让按钮点击正常工作
      setIsDragging(true);
      hasDraggedRef.current = false;
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: position.x,
        posY: position.y,
      };
    },
    [position],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      // 仅当移动距离超过 5px 时才认为是拖拽
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        hasDraggedRef.current = true;
      }

      const newX = dragStartRef.current.posX - dx;
      const newY = dragStartRef.current.posY - dy;

      // 限制在窗口范围内（从右下角计算）
      const maxX = window.innerWidth - 60;
      const maxY = window.innerHeight - 60;

      setPosition({
        x: Math.max(10, Math.min(newX, maxX)),
        y: Math.max(10, Math.min(newY, maxY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // 不启用时不渲染
  if (!enabled) return null;

  const remainingText = remainingMs !== null ? formatRemainingTime(remainingMs) : "--";

  // 判断是否最后 1 分钟（60 秒）
  const isLastMinute = remainingMs !== null && remainingMs <= 60000;

  // 计算是否应该展开（只有 hover 时展开）
  const shouldExpand = isHovered;

  // 计算动态宽度
  const dynamicWidth = shouldExpand ? Math.max(contentWidth, 120) : 48;

  // 胶囊容器
  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => {
        if (!isDragging) {
          setIsHovered(true);
        }
      }}
      onMouseLeave={() => !isDragging && setIsHovered(false)}
      style={{
        position: "fixed",
        right: position.x,
        bottom: position.y,
        height: 48,
        width: dynamicWidth,
        borderRadius: 24,
        background: darkMode
          ? "rgba(30, 30, 35, 0.95)"
          : "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: darkMode
          ? "1px solid rgba(255, 255, 255, 0.08)"
          : "1px solid rgba(0, 0, 0, 0.06)",
        boxShadow: darkMode
          ? "0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)"
          : "0 8px 24px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(255, 255, 255, 0.5)",
        cursor: isDragging ? "grabbing" : "grab",
        zIndex: 9999,
        userSelect: "none",
        WebkitUserSelect: "none",
        transition: isDragging
          ? "none"
          : "width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        padding: "0 8px",
      }}
    >
      {/* 中心内容：收起时显示 icon 或倒计时，展开时显示完整内容 */}
      {!shouldExpand ? (
        // 收起状态：最后1分钟显示倒计时文字，否则显示 icon
        isLastMinute ? (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#ff4d4f",
              fontFamily: "'SF Mono', monospace",
              whiteSpace: "nowrap",
              textAlign: "center",
              width: "100%",
            }}
          >
            {remainingText}
          </span>
        ) : (
          <img
            src={logoRounded}
            alt="CCMonitor"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              pointerEvents: "none",
            }}
            draggable={false}
          />
        )
      ) : (
        // 展开状态：显示完整内容
        <>
          {/* 右侧图标（固定位置） */}
          <div
            style={{
              position: "absolute",
              right: 8,
              width: 32,
              height: 32,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <img
              src={logoRounded}
              alt="CCMonitor"
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                pointerEvents: "none",
              }}
              draggable={false}
            />
          </div>

          {/* 左侧内容 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              opacity: 1,
              transition: "opacity 0.2s ease",
              paddingRight: 40,
              flex: 1,
            }}
          >
            {/* 发光小圆点 */}
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: isLastMinute ? "#ff4d4f" : themeVars.primary,
                boxShadow: isLastMinute
                  ? "0 0 8px #ff4d4f"
                  : `0 0 8px ${themeVars.primary}`,
                flexShrink: 0,
                animation: isLastMinute ? "pulse 1s infinite" : "none",
              }}
            />

            {/* 倒计时文字 */}
            <span
              ref={textRef}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: isLastMinute ? "#ff4d4f" : themeVars.text,
                fontFamily: "'SF Mono', monospace",
                whiteSpace: "nowrap",
              }}
            >
              {remainingText}
            </span>
          </div>
        </>
      )}

      {/* CSS 动画 */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
};

export default CleanupCountdown;
