import { useCallback, useEffect, useRef } from "react";

const INTERACTIVE_SELECTOR =
  "button, a, input, select, textarea, label, [role='button']";

function headerOffsetPx() {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--header-height")
    .trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 64;
}

function resetTheadInline(thead, thWidths) {
  if (!thead) return;
  thead.classList.remove("is-stuck");
  thead.style.position = "";
  thead.style.top = "";
  thead.style.left = "";
  thead.style.width = "";
  thead.style.transform = "";
  thead.style.zIndex = "";
  thead.style.margin = "";
  thead.style.display = "";
  thead.style.tableLayout = "";
  thead.querySelectorAll("th").forEach((th, i) => {
    th.style.minWidth = "";
    th.style.width = thWidths?.[i] || "";
    th.style.maxWidth = "";
    th.style.boxSizing = "";
  });
}

/**
 * Mouse drag pan + sticky table head for page scroll.
 * Clip shell keeps the fixed head inside the table's visible horizontal bounds.
 * Column widths are locked while thead is detached so the body does not reflow.
 */
export function useEstimateTablePan() {
  const cleanupRef = useRef(null);

  const setNodeRef = useCallback((node) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (!node) return;

    const table = node.querySelector("table");
    const thead = node.querySelector("thead");
    let isDown = false;
    let moved = false;
    let startX = 0;
    let scrollLeft = 0;
    let rafId = 0;
    let stuck = false;
    let naturalThWidths = [];
    let lockedTableWidth = "";
    let spacer = null;
    let clip = null;
    let homeParent = null;
    let homeNextSibling = null;

    const measureThWidths = () => {
      if (!thead) return [];
      return Array.from(thead.querySelectorAll("th")).map(
        (th) => `${th.getBoundingClientRect().width}px`,
      );
    };

    const lockBodyColumns = (widths) => {
      if (!table || !widths.length) return;

      const total = widths.reduce(
        (sum, w) => sum + (Number.parseFloat(w) || 0),
        0,
      );
      lockedTableWidth = `${total}px`;

      let colgroup = table.querySelector("colgroup.estimate-col-lock");
      if (!colgroup) {
        colgroup = document.createElement("colgroup");
        colgroup.className = "estimate-col-lock";
        table.insertBefore(colgroup, table.firstChild);
      }
      while (colgroup.firstChild) colgroup.removeChild(colgroup.firstChild);
      widths.forEach((w) => {
        const col = document.createElement("col");
        col.style.width = w;
        colgroup.appendChild(col);
      });

      table.style.tableLayout = "fixed";
      table.style.width = lockedTableWidth;
      table.style.minWidth = lockedTableWidth;

      table.querySelectorAll("tbody tr").forEach((tr) => {
        const cells = tr.children;
        if (cells.length === 1 && cells[0].colSpan > 1) return;
        Array.from(cells).forEach((td, i) => {
          if (!widths[i]) return;
          td.style.boxSizing = "border-box";
          td.style.width = widths[i];
          td.style.minWidth = widths[i];
          td.style.maxWidth = widths[i];
        });
      });
    };

    const unlockBodyColumns = () => {
      if (!table) return;
      table.querySelector("colgroup.estimate-col-lock")?.remove();
      table.style.tableLayout = "";
      table.style.width = "";
      table.style.minWidth = "";
      lockedTableWidth = "";
      table.querySelectorAll("tbody td").forEach((td) => {
        td.style.width = "";
        td.style.minWidth = "";
        td.style.maxWidth = "";
        td.style.boxSizing = "";
      });
    };

    const ensureSpacer = (height) => {
      if (!table) return;
      if (!spacer) {
        spacer = document.createElement("div");
        spacer.className = "estimate-thead-spacer";
        spacer.setAttribute("aria-hidden", "true");
        table.parentNode?.insertBefore(spacer, table);
      }
      spacer.style.height = `${height}px`;
    };

    const removeSpacer = () => {
      if (spacer?.parentNode) spacer.parentNode.removeChild(spacer);
      spacer = null;
    };

    const ensureClip = () => {
      if (clip) return clip;
      clip = document.createElement("div");
      clip.className = "estimate-thead-clip";
      clip.setAttribute("aria-hidden", "true");
      document.body.appendChild(clip);
      return clip;
    };

    const unstick = () => {
      if (!stuck || !thead) return;
      if (homeParent) {
        homeParent.insertBefore(thead, homeNextSibling);
      }
      resetTheadInline(thead, naturalThWidths);
      unlockBodyColumns();
      if (clip?.parentNode) clip.parentNode.removeChild(clip);
      clip = null;
      removeSpacer();
      stuck = false;
      homeParent = null;
      homeNextSibling = null;
    };

    const updateStickyHead = () => {
      if (!thead || !table) return;

      const offset = headerOffsetPx();
      const wrapRect = node.getBoundingClientRect();
      const headH = thead.offsetHeight || 0;
      const shouldStick =
        wrapRect.top < offset && wrapRect.bottom - headH > offset;

      if (!shouldStick) {
        unstick();
        return;
      }

      if (!stuck) {
        naturalThWidths = measureThWidths();
        // Lock before detaching thead — otherwise auto layout reflows columns.
        lockBodyColumns(naturalThWidths);
        homeParent = thead.parentNode;
        homeNextSibling = thead.nextSibling;
        ensureSpacer(headH);
        const shell = ensureClip();
        shell.appendChild(thead);
        thead.classList.add("is-stuck");
        stuck = true;
      } else {
        ensureSpacer(headH);
        // Re-apply in case React recreated rows / wiped injected colgroup.
        if (naturalThWidths.length) lockBodyColumns(naturalThWidths);
      }

      const shell = ensureClip();
      const widths = naturalThWidths.length
        ? naturalThWidths
        : measureThWidths();

      shell.style.top = `${offset}px`;
      shell.style.left = `${wrapRect.left}px`;
      shell.style.width = `${wrapRect.width}px`;
      shell.style.height = `${headH}px`;

      const headWidth =
        lockedTableWidth ||
        `${Math.max(table.scrollWidth, wrapRect.width)}px`;

      thead.style.position = "relative";
      thead.style.top = "0";
      thead.style.left = "0";
      thead.style.width = headWidth;
      thead.style.transform = `translateX(${-node.scrollLeft}px)`;
      thead.style.zIndex = "";
      thead.style.margin = "0";
      thead.style.display = "table";
      thead.style.tableLayout = "fixed";

      thead.querySelectorAll("th").forEach((th, i) => {
        if (widths[i]) {
          th.style.boxSizing = "border-box";
          th.style.width = widths[i];
          th.style.minWidth = widths[i];
          th.style.maxWidth = widths[i];
        }
      });
    };

    const scheduleSticky = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updateStickyHead();
      });
    };

    const onMouseDown = (event) => {
      if (event.button !== 0) return;
      if (event.target.closest?.(INTERACTIVE_SELECTOR)) return;

      isDown = true;
      moved = false;
      startX = event.pageX;
      scrollLeft = node.scrollLeft;
      node.classList.add("is-dragging");
      event.preventDefault();
    };

    const onMouseMove = (event) => {
      if (!isDown) return;
      const dx = event.pageX - startX;
      if (Math.abs(dx) > 2) moved = true;
      if (!moved) return;
      event.preventDefault();
      node.scrollLeft = scrollLeft - dx;
      scheduleSticky();
    };

    const onMouseUp = () => {
      if (!isDown) return;
      isDown = false;
      node.classList.remove("is-dragging");
    };

    node.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove, { passive: false });
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("scroll", scheduleSticky, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", scheduleSticky);
    node.addEventListener("scroll", scheduleSticky, { passive: true });
    updateStickyHead();

    cleanupRef.current = () => {
      isDown = false;
      node.classList.remove("is-dragging");
      if (rafId) window.cancelAnimationFrame(rafId);
      unstick();
      node.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("scroll", scheduleSticky, true);
      window.removeEventListener("resize", scheduleSticky);
      node.removeEventListener("scroll", scheduleSticky);
    };
  }, []);

  useEffect(() => () => cleanupRef.current?.(), []);

  return setNodeRef;
}

/** @deprecated use useEstimateTablePan */
export function useDragScroll() {
  return useEstimateTablePan();
}
