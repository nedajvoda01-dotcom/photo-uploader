"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import styles from "./carDetail.module.css";

interface Car {
  id: number;
  region: string;
  make: string;
  model: string;
  vin: string;
  disk_root_path: string;
  created_by: number;
  created_at: string;
}

interface CarSlot {
  id: number;
  car_id: number;
  slot_type: string;
  slot_index: number;
  status: string;
  locked_at: string | null;
  locked_by: number | null;
  lock_meta_json: string | null;
  disk_slot_path: string;
  public_url: string | null;
  is_used: boolean;
  marked_used_at: string | null;
  marked_used_by: number | null;
}

interface CarLink {
  id: number;
  car_id: number;
  label: string;
  url: string;
  created_by: number;
  created_at: string;
}

interface Comment {
  id: string;
  text: string;
}

interface CollapseSection {
  title: string;
  contentId: string;
  defaultOpen?: boolean;
}

function CollapseBlock({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.collapseSection}>
      <div className={styles.sectionHeader} onClick={() => setOpen((v) => !v)}>
        <div className={styles.sectionHeaderLeft}>
          <span className={`${styles.collapseIcon} ${open ? styles.expanded : ""}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
              <path d="M10.061 19.061L17.121 12l-7.06-7.061l-2.122 2.122L12.879 12l-4.94 4.939z" fill="currentColor" />
            </svg>
          </span>
          <span className={styles.sectionHeaderTitle}>{title}</span>
        </div>
      </div>
      {open && <div className={styles.sectionContent}>{children}</div>}
    </div>
  );
}

function SpecsGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className={styles.specsGrid}>
      {items.map(({ label, value }) => (
        <div key={label} className={styles.specItem}>
          <span className={styles.specLabel}>{label}</span>
          <span className={styles.specValue}>{value || "—"}</span>
        </div>
      ))}
    </div>
  );
}

/* ===== Photo Viewer ===== */
function PhotoViewer({
  photos,
  initialIndex,
  onClose,
}: {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(initialIndex);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowUp" || e.key === "ArrowLeft")
        setCurrent((i) => Math.max(0, i - 1));
      if (e.key === "ArrowDown" || e.key === "ArrowRight")
        setCurrent((i) => Math.min(photos.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photos.length, onClose]);

  const prev = current > 0 ? photos[current - 1] : null;
  const next = current < photos.length - 1 ? photos[current + 1] : null;

  return (
    <div className={styles.viewerBackdrop} onClick={onClose}>
      <div className={styles.viewer} onClick={(e) => e.stopPropagation()}>
        {/* Left rail */}
        <div className={styles.viewerRail}>
          <button
            className={styles.railBtn}
            onClick={() => setCurrent((i) => Math.max(0, i - 1))}
            disabled={current === 0}
          >
            <svg width="30" height="30" viewBox="0 0 24 24">
              <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" fill="currentColor" />
            </svg>
          </button>
          <div className={styles.viewerThumbs}>
            {photos.map((src, i) => (
              <div
                key={i}
                className={`${styles.thumb} ${i === current ? styles.active : ""}`}
                onClick={() => setCurrent(i)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Photo ${i + 1}`} />
              </div>
            ))}
          </div>
          <button
            className={styles.railBtn}
            onClick={() => setCurrent((i) => Math.min(photos.length - 1, i + 1))}
            disabled={current === photos.length - 1}
          >
            <svg width="30" height="30" viewBox="0 0 24 24">
              <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" fill="currentColor" />
            </svg>
          </button>
        </div>

        {/* Stage */}
        <div className={styles.viewerStage}>
          <div className={styles.viewerCounter}>{current + 1} / {photos.length}</div>
          <button className={styles.viewerClose} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
            </svg>
          </button>
          <div className={styles.stageStack}>
            {prev && (
              <div className={`${styles.stageItem} ${styles.preview}`} onClick={() => setCurrent((i) => i - 1)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.stageImg} src={prev} alt="prev" />
              </div>
            )}
            <div className={`${styles.stageItem} ${styles.main}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.stageImg} src={photos[current]} alt={`Photo ${current + 1}`} />
            </div>
            {next && (
              <div className={`${styles.stageItem} ${styles.preview}`} onClick={() => setCurrent((i) => i + 1)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.stageImg} src={next} alt="next" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Kit Card (photo group) ===== */
function KitCard({
  title,
  slot,
  vin,
  onUploaded,
  userRole,
}: {
  title: string;
  slot: CarSlot;
  vin: string;
  onUploaded: () => void;
  userRole: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [togglingUsed, setTogglingUsed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLocked = slot.status === "locked";
  const isUsed = slot.is_used;
  const isAdmin = userRole === "admin";

  const lockMeta = slot.lock_meta_json ? (() => { try { return JSON.parse(slot.lock_meta_json!); } catch { return null; } })() : null;
  const fileCount: number = lockMeta?.fileCount ?? (isLocked ? 1 : 0);

  const photos: string[] = slot.public_url ? [slot.public_url] : [];

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    setUploadErr("");
    try {
      const fd = new FormData();
      fd.append("slotType", slot.slot_type);
      fd.append("slotIndex", slot.slot_index.toString());
      for (let i = 0; i < files.length; i++) fd.append(`file${i + 1}`, files[i]);
      const res = await fetch(`/api/cars/vin/${vin}/upload`, { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json();
        setUploadErr(d.error || "Ошибка загрузки");
      } else {
        onUploaded();
      }
    } catch {
      setUploadErr("Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  };

  const handleToggleUsed = async () => {
    if (!isAdmin) return;
    setTogglingUsed(true);
    try {
      const res = await fetch(`/api/cars/vin/${vin}/slots/${slot.slot_type}/${slot.slot_index}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isUsed: !isUsed }),
      });
      if (res.ok) onUploaded();
    } finally {
      setTogglingUsed(false);
    }
  };

  return (
    <div className={`${styles.kitCard} ${isUsed ? styles.kitUsed : ""}`}>
      <div className={styles.kitDragHandle} />

      <div className={styles.kitTop}>
        <span className={styles.kitTitle}>
          {title} · Слот {slot.slot_index}
        </span>
        <div className={styles.kitActions}>
          {isLocked && photos.length > 0 && (
            <button
              className={`${styles.iconBtn} ${styles.iconBtnDark}`}
              title="Просмотреть"
              onClick={() => setViewerOpen(true)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor" />
              </svg>
            </button>
          )}
          {!isLocked && (
            <button
              className={`${styles.iconBtn} ${styles.iconBtnUpload}`}
              title="Загрузить фото"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z" fill="currentColor" />
              </svg>
            </button>
          )}
          {isLocked && isAdmin && (
            <button
              className={`${styles.iconBtn} ${isUsed ? styles.iconBtnDark : styles.iconBtnDark}`}
              title={isUsed ? "Снять отметку «использовано»" : "Отметить как использовано"}
              onClick={handleToggleUsed}
              disabled={togglingUsed}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                {isUsed
                  ? <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor" />
                  : <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" fill="currentColor" />
                }
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className={styles.kitDivider} />

      {/* Used row */}
      <div className={styles.kitUsedRow}>
        <div className={styles.kitCheck}>
          {isUsed && (
            <svg width="14" height="14" viewBox="0 0 24 24">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor" />
            </svg>
          )}
        </div>
        <span>Использовано</span>
      </div>

      {/* Photo grid: 6 tiles */}
      <div className={styles.kitGrid}>
        {Array.from({ length: 6 }).map((_, tileIdx) => {
          if (!isLocked) {
            if (tileIdx === 0) {
              return (
                <div
                  key={tileIdx}
                  className={`${styles.tile} ${styles.tileAdd}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className={styles.icon}>
                    <svg width="30" height="30" viewBox="0 0 24 24">
                      <path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z" fill="currentColor" />
                    </svg>
                  </span>
                </div>
              );
            }
            return <div key={tileIdx} className={`${styles.tile} ${styles.tileEmpty}`} />;
          }
          const photoSrc = tileIdx < photos.length ? photos[tileIdx] : null;
          if (photoSrc) {
            return (
              <div
                key={tileIdx}
                className={`${styles.tile} ${styles.tilePhoto}`}
                onClick={() => setViewerOpen(true)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoSrc} alt={`Slot photo ${tileIdx + 1}`} />
              </div>
            );
          }
          return <div key={tileIdx} className={`${styles.tile} ${styles.tileEmpty}`} />;
        })}
      </div>

      {/* Footer */}
      <div className={styles.kitFooter}>
        <span>Всего фото: {fileCount}</span>
        <span>{isLocked ? "Заполнено" : "Пусто"}</span>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.length) handleUpload(e.target.files); e.target.value = ""; }}
      />

      {uploading && <div className={styles.uploadingMsg}>Загружаем...</div>}
      {uploadErr && <div className={styles.uploadErr}>{uploadErr}</div>}

      {viewerOpen && photos.length > 0 && (
        <PhotoViewer photos={photos} initialIndex={0} onClose={() => setViewerOpen(false)} />
      )}
    </div>
  );
}

/* ===== Main Page ===== */
export default function CarDetailPage() {
  const router = useRouter();
  const params = useParams();
  const vin = (params.vin as string).toUpperCase();

  const [car, setCar] = useState<Car | null>(null);
  const [slots, setSlots] = useState<CarSlot[]>([]);
  const [links, setLinks] = useState<CarLink[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState("");
  const [userRole, setUserRole] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [archiving, setArchiving] = useState(false);

  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [showNewComment, setShowNewComment] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [showNewLink, setShowNewLink] = useState(false);

  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load draft comments from localStorage
  useEffect(() => {
    const key = `carDraft:${vin}:comments`;
    try {
      const stored = localStorage.getItem(key);
      if (stored) setComments(JSON.parse(stored));
    } catch { /* ignore */ }
  }, [vin]);

  const saveComments = (updated: Comment[]) => {
    setComments(updated);
    try {
      localStorage.setItem(`carDraft:${vin}:comments`, JSON.stringify(updated));
    } catch { /* ignore */ }
  };

  const fetchCarData = useCallback(async (attempt = 0) => {
    const MAX_RETRIES = 10;
    const RETRY_DELAYS = [500, 1000, 1500, 2000, 2500, 3000, 3000, 3000, 3000, 3000];
    try {
      const res = await fetch(`/api/cars/vin/${vin}`);
      if (!res.ok) {
        if (res.status === 401) { router.push("/login"); return; }
        if (res.status === 403) { setError("Нет доступа"); setLoading(false); setIsRetrying(false); return; }
        if (res.status === 404 && attempt < MAX_RETRIES) {
          setIsRetrying(true);
          setRetryCount(attempt + 1);
          setLoading(false);
          const delay = RETRY_DELAYS[attempt] || 3000;
          if (retryRef.current) clearTimeout(retryRef.current);
          retryRef.current = setTimeout(() => { retryRef.current = null; fetchCarData(attempt + 1); }, delay);
          return;
        }
        setError("Автомобиль не найден");
        setLoading(false);
        setIsRetrying(false);
        return;
      }
      const data = await res.json();
      setCar(data.car);
      setSlots(data.slots || []);
      setLinks(data.links || []);
      setIsRetrying(false);
      setRetryCount(0);
      setLoading(false);
    } catch {
      setError("Ошибка загрузки данных");
      setLoading(false);
      setIsRetrying(false);
    }
  }, [vin, router]);

  useEffect(() => {
    fetchCarData(0);
    fetch("/api/me").then(r => r.ok ? r.json() : null).then(d => {
      if (d) { setUserRole(d.role || ""); setUserEmail(d.email || ""); }
    }).catch(() => {});
    return () => { if (retryRef.current) clearTimeout(retryRef.current); };
  }, [fetchCarData]);

  const handleAddLink = async () => {
    if (!newLinkLabel || !newLinkUrl) return;
    setAddingLink(true);
    try {
      const res = await fetch(`/api/cars/vin/${vin}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLinkLabel, url: newLinkUrl }),
      });
      if (res.ok) {
        setShowNewLink(false);
        setNewLinkLabel("");
        setNewLinkUrl("");
        fetchCarData(0);
      }
    } finally {
      setAddingLink(false);
    }
  };

  const handleDeleteLink = async (linkId: number) => {
    if (!confirm("Удалить ссылку?")) return;
    await fetch(`/api/links/${linkId}`, { method: "DELETE" });
    fetchCarData(0);
  };

  const handleArchiveCar = async () => {
    if (!confirm(`Архивировать "${car?.make} ${car?.model}" (VIN: ${car?.vin})?`)) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/cars/vin/${vin}`, { method: "DELETE" });
      if (res.ok) { router.refresh(); router.push("/cars"); }
      else { const d = await res.json(); alert(d.error || "Ошибка архивирования"); }
    } finally {
      setArchiving(false);
    }
  };

  const handleAddComment = () => {
    if (!newCommentText.trim()) return;
    const updated = [...comments, { id: Date.now().toString(), text: newCommentText.trim() }];
    saveComments(updated);
    setNewCommentText("");
    setShowNewComment(false);
  };

  const handleDeleteComment = (id: string) => {
    if (!confirm("Удалить комментарий?")) return;
    saveComments(comments.filter((c) => c.id !== id));
  };

  const handleSaveComment = (id: string) => {
    if (!editCommentText.trim()) { handleDeleteComment(id); return; }
    saveComments(comments.map((c) => c.id === id ? { ...c, text: editCommentText.trim() } : c));
    setEditingComment(null);
    setEditCommentText("");
  };

  if (loading || isRetrying) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          {isRetrying ? `Создание автомобиля... (попытка ${retryCount}/10)` : "Загрузка..."}
        </div>
      </div>
    );
  }

  if (error || !car) {
    return (
      <div className={styles.page}>
        <div className={styles.mainContainer}>
          <div className={styles.errorState}>{error || "Автомобиль не найден"}</div>
          <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
            <Link href="/cars" className={styles.backLink}>← Назад</Link>
            <button
              onClick={() => { setError(""); setLoading(true); fetchCarData(0); }}
              className={styles.retryBtn}
            >
              🔄 Повторить
            </button>
          </div>
        </div>
      </div>
    );
  }

  const dealerSlots = slots.filter((s) => s.slot_type === "dealer");
  const buyoutSlots = slots.filter((s) => s.slot_type === "buyout");
  const dummiesSlots = slots.filter((s) => s.slot_type === "dummies");
  const lockedCount = slots.filter((s) => s.status === "locked").length;
  const totalSlots = 14;

  const isAdmin = userRole === "admin";

  return (
    <div className={styles.page}>
      <div className={styles.mainContainer}>
        {/* Car content */}
        <div className={styles.carContent}>

          {/* Top bar */}
          <div className={styles.topBar}>
            <Link href="/cars" className={styles.backLink}>← Назад</Link>
            <div className={styles.topBarRight}>
              <span className={styles.userEmail}>{userEmail}</span>
              {isAdmin && (
                <button className={styles.archiveBtn} onClick={handleArchiveCar} disabled={archiving}>
                  {archiving ? "..." : "📦 Архив"}
                </button>
              )}
            </div>
          </div>

          {/* Card title */}
          <div className={styles.carCardTitle}>
            {car.make} {car.model}
            <span className={styles.vinBadge}>{car.vin}</span>
          </div>

          {/* BLOCK 1: Основные характеристики */}
          <CollapseBlock title="Основные характеристики">
            <SpecsGrid items={[
              { label: "Марка", value: car.make },
              { label: "Модель", value: car.model },
              { label: "Регион", value: car.region },
              { label: "VIN", value: car.vin },
              { label: "Создан", value: new Date(car.created_at).toLocaleDateString("ru-RU") },
            ]} />
          </CollapseBlock>

          {/* BLOCK 2: Документы и регистрация */}
          <CollapseBlock title="Документы и регистрация">
            <SpecsGrid items={[
              { label: "VIN", value: car.vin },
              { label: "Диск", value: car.disk_root_path },
            ]} />
          </CollapseBlock>

          {/* BLOCK 3: Финансы и расходы */}
          <CollapseBlock title="Финансы и расходы">
            <SpecsGrid items={[
              { label: "Информация", value: "Нет данных" },
            ]} />
          </CollapseBlock>

          {/* BLOCK 4: Дополнительная информация (comments + links) */}
          <CollapseBlock title="Дополнительная информация" defaultOpen>
            <div className={styles.additionalBlock}>

              {/* Comments */}
              <div className={styles.additionalItem}>
                <div className={styles.additionalHeader}>
                  <span className={styles.additionalTitle}>Комментарий</span>
                  <button
                    className={`${styles.iconBtn} ${styles.iconBtnUpload}`}
                    title="Добавить комментарий"
                    onClick={() => { setShowNewComment(true); setNewCommentText(""); }}
                  >
                    <span className={styles.icon}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z" />
                      </svg>
                    </span>
                  </button>
                </div>

                {showNewComment && (
                  <div className={styles.commentEditRow}>
                    <textarea
                      className={styles.commentInput}
                      placeholder="Введите комментарий"
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(); }
                        if (e.key === "Escape") { setShowNewComment(false); setNewCommentText(""); }
                      }}
                    />
                    <button className={styles.commentSaveBtn} onClick={handleAddComment}>Сохранить</button>
                    <button className={styles.commentCancelBtn} onClick={() => { setShowNewComment(false); setNewCommentText(""); }}>Отмена</button>
                  </div>
                )}

                <div className={styles.commentsList}>
                  {comments.map((comment) => (
                    <div key={comment.id} className={styles.commentBlock}>
                      {editingComment === comment.id ? (
                        <div className={styles.commentEditRow}>
                          <textarea
                            className={styles.commentInput}
                            value={editCommentText}
                            onChange={(e) => setEditCommentText(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveComment(comment.id); }
                              if (e.key === "Escape") { setEditingComment(null); }
                            }}
                          />
                          <button className={styles.commentSaveBtn} onClick={() => handleSaveComment(comment.id)}>Сохранить</button>
                          <button className={styles.commentCancelBtn} onClick={() => setEditingComment(null)}>Отмена</button>
                        </div>
                      ) : (
                        <>
                          <div className={styles.commentText}>{comment.text}</div>
                          <button
                            className={`${styles.iconBtn} ${styles.iconBtnGhost}`}
                            title="Редактировать"
                            onClick={() => { setEditingComment(comment.id); setEditCommentText(comment.text); }}
                          >
                            <span className={styles.icon}>
                              <svg width="24" height="24" viewBox="0 0 24 24">
                                <path d="M16 2.012l3 3L16.713 7.3l-3-3zM4 14v3h3l8.299-8.287l-3-3zm0 6h16v2H4z" fill="currentColor" />
                              </svg>
                            </span>
                          </button>
                          <button
                            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                            title="Удалить"
                            onClick={() => handleDeleteComment(comment.id)}
                          >
                            <span className={styles.icon}>
                              <svg width="24" height="24" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M5 20a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8h2V6h-4V4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H3v2h2zM9 4h6v2H9zM8 8h9v12H7V8z" />
                              </svg>
                            </span>
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Links */}
              <div className={styles.additionalItem}>
                <div className={styles.additionalHeader}>
                  <span className={styles.additionalTitle}>Прикреплённые ссылки</span>
                  <button
                    className={`${styles.iconBtn} ${styles.iconBtnUpload}`}
                    title="Добавить ссылку"
                    onClick={() => { setShowNewLink(true); setNewLinkLabel(""); setNewLinkUrl(""); }}
                  >
                    <span className={styles.icon}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z" />
                      </svg>
                    </span>
                  </button>
                </div>

                {showNewLink && (
                  <div className={styles.linkEditRow}>
                    <input
                      className={styles.linkTypeInput}
                      type="text"
                      placeholder="Название"
                      value={newLinkLabel}
                      onChange={(e) => setNewLinkLabel(e.target.value)}
                      autoFocus
                    />
                    <input
                      className={styles.linkUrlInput}
                      type="url"
                      placeholder="https://..."
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { handleAddLink(); }
                        if (e.key === "Escape") { setShowNewLink(false); setNewLinkLabel(""); setNewLinkUrl(""); }
                      }}
                    />
                    <button className={styles.commentSaveBtn} onClick={handleAddLink} disabled={addingLink}>
                      {addingLink ? "..." : "Добавить"}
                    </button>
                    <button className={styles.commentCancelBtn} onClick={() => { setShowNewLink(false); setNewLinkLabel(""); setNewLinkUrl(""); }}>
                      Отмена
                    </button>
                  </div>
                )}

                <div className={styles.linksList}>
                  {links.map((link) => (
                    <div key={link.id} className={styles.linkItem}>
                      <span className={styles.linkType}>{link.label}</span>
                      <a
                        className={styles.linkUrl}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {link.url}
                      </a>
                      <div className={styles.linkActions}>
                        <button
                          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                          title="Удалить"
                          onClick={() => handleDeleteLink(link.id)}
                        >
                          <span className={styles.icon}>
                            <svg width="24" height="24" viewBox="0 0 24 24">
                              <path fill="currentColor" d="M5 20a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8h2V6h-4V4a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v2H3v2h2zM9 4h6v2H9zM8 8h9v12H7V8z" />
                            </svg>
                          </span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CollapseBlock>

          {/* BLOCK 5: Photos section */}
          <CollapseBlock title="Фотографии" defaultOpen>
            <div className={styles.photosHeader}>
              <span className={styles.photosStat}>{lockedCount} / {totalSlots} слотов заполнено</span>
            </div>

            {dealerSlots.length > 0 && (
              <div className={styles.photoGroup}>
                <div className={styles.photoGroupTitle}>Дилерские фото</div>
                <div className={styles.kits}>
                  {dealerSlots.map((slot) => (
                    <KitCard
                      key={slot.id}
                      title="Дилер"
                      slot={slot}
                      vin={vin}
                      onUploaded={() => fetchCarData(0)}
                      userRole={userRole}
                    />
                  ))}
                </div>
              </div>
            )}

            {buyoutSlots.length > 0 && (
              <div className={styles.photoGroup}>
                <div className={styles.photoGroupTitle}>Выкупные фото</div>
                <div className={styles.kits}>
                  {buyoutSlots.map((slot) => (
                    <KitCard
                      key={slot.id}
                      title="Выкуп"
                      slot={slot}
                      vin={vin}
                      onUploaded={() => fetchCarData(0)}
                      userRole={userRole}
                    />
                  ))}
                </div>
              </div>
            )}

            {dummiesSlots.length > 0 && (
              <div className={styles.photoGroup}>
                <div className={styles.photoGroupTitle}>Дополнительные фото</div>
                <div className={styles.kits}>
                  {dummiesSlots.map((slot) => (
                    <KitCard
                      key={slot.id}
                      title="Доп"
                      slot={slot}
                      vin={vin}
                      onUploaded={() => fetchCarData(0)}
                      userRole={userRole}
                    />
                  ))}
                </div>
              </div>
            )}
          </CollapseBlock>

        </div>
      </div>
    </div>
  );
}
