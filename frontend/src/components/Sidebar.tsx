import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, TreeItem } from "../lib/api";
import { useAuth } from "../lib/auth";

interface Props {
  locale: string;
}

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
}

function buildTree(items: TreeItem[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const item of items) {
    const parts = item.path.split("/");
    let current = root;
    let pathSoFar = "";
    for (let i = 0; i < parts.length; i++) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${parts[i]}` : parts[i];
      let node = current.find((n) => n.name === parts[i]);
      if (!node) {
        node = { name: parts[i], path: pathSoFar, children: [] };
        current.push(node);
      }
      current = node.children;
    }
  }
  return root;
}

function getParentDir(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.substring(0, idx);
}

function getFileName(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.substring(idx + 1);
}

/** Collect all names from tree for ordering */
function collectNames(nodes: TreeNode[]): string[] {
  const names: string[] = [];
  for (const n of nodes) {
    names.push(n.name);
    if (n.children.length > 0) {
      names.push(...collectNames(n.children));
    }
  }
  return names;
}

interface TreeNodeViewProps {
  node: TreeNode;
  locale: string;
  isAdmin: boolean;
  dragPath: string | null;
  dropIndicator: { path: string; position: "before" | "after" | "inside" } | null;
  onDragStart: (path: string) => void;
  onDragOver: (path: string, position: "before" | "after" | "inside", e: React.DragEvent) => void;
  onDrop: () => void;
  onDragLeave: () => void;
  onRename: (oldPath: string, newName: string) => void;
}

function TreeNodeView({
  node, locale, isAdmin, dragPath, dropIndicator,
  onDragStart, onDragOver, onDrop, onDragLeave, onRename,
}: TreeNodeViewProps) {
  const { "*": currentPath } = useParams();
  const { t } = useTranslation();
  const isActive = currentPath === node.path;
  const isFile = node.children.length === 0;

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!isAdmin || !isFile) return;
    e.preventDefault();
    e.stopPropagation();
    setEditValue(node.name.replace(/\.md$/, ""));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleRenameConfirm = () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === node.name.replace(/\.md$/, "")) {
      setEditing(false);
      return;
    }
    const newName = trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
    onRename(node.path, newName);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleRenameConfirm();
    if (e.key === "Escape") setEditing(false);
  };

  const handleItemDragOver = (e: React.DragEvent) => {
    if (!isAdmin || !dragPath || dragPath === node.path) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (!isFile) {
      // Folder: top 25% = before, bottom 25% = after, middle = inside
      if (y < rect.height * 0.25) {
        onDragOver(node.path, "before", e);
      } else if (y > rect.height * 0.75) {
        onDragOver(node.path, "after", e);
      } else {
        onDragOver(node.path, "inside", e);
      }
    } else {
      // File: top half = before, bottom half = after
      onDragOver(node.path, y < rect.height / 2 ? "before" : "after", e);
    }
  };

  const isDropTarget = dropIndicator?.path === node.path;
  const dropPos = dropIndicator?.position;

  const dropClass = isDropTarget
    ? dropPos === "inside"
      ? " drop-inside"
      : dropPos === "before"
        ? " drop-before"
        : " drop-after"
    : "";

  if (isFile) {
    return (
      <li className={dropClass}>
        {editing ? (
          <input
            ref={inputRef}
            className="sidebar-rename-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleRenameConfirm}
            autoFocus
          />
        ) : (
          <Link
            to={`/docs/${locale}/${node.path}`}
            className={`sidebar-item${isActive ? " active" : ""}`}
            draggable={isAdmin}
            onDragStart={(e) => {
              if (!isAdmin) return;
              e.dataTransfer.setData("text/plain", node.path);
              onDragStart(node.path);
            }}
            onDragOver={handleItemDragOver}
            onDragLeave={onDragLeave}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(); }}
            onDoubleClick={handleDoubleClick}
            title={isAdmin ? t("docs.doubleClickRename") : undefined}
          >
            {node.name.replace(/\.md$/, "")}
          </Link>
        )}
      </li>
    );
  }

  return (
    <li className={dropClass}>
      <span
        className="sidebar-group"
        draggable={isAdmin}
        onDragStart={(e) => {
          if (!isAdmin) return;
          e.dataTransfer.setData("text/plain", node.path);
          onDragStart(node.path);
        }}
        onDragOver={handleItemDragOver}
        onDragLeave={onDragLeave}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(); }}
      >
        {node.name}
      </span>
      <ul>
        {node.children.map((child) => (
          <TreeNodeView
            key={child.path}
            node={child}
            locale={locale}
            isAdmin={isAdmin}
            dragPath={dragPath}
            dropIndicator={dropIndicator}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragLeave={onDragLeave}
            onRename={onRename}
          />
        ))}
      </ul>
    </li>
  );
}

export function Sidebar({ locale }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ path: string; position: "before" | "after" | "inside" } | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = !!user?.is_admin;

  const refreshTree = useCallback(() => {
    api.tree(locale).then((data) => setTree(buildTree(data.items)));
  }, [locale]);

  useEffect(() => {
    refreshTree();
  }, [refreshTree]);

  const handleDragOver = (path: string, position: "before" | "after" | "inside", e: React.DragEvent) => {
    e.preventDefault();
    setDropIndicator({ path, position });
  };

  const handleDrop = async () => {
    if (!dragPath || !dropIndicator) {
      setDragPath(null);
      setDropIndicator(null);
      return;
    }

    const { path: targetPath, position } = dropIndicator;

    if (position === "inside") {
      // Move file into folder
      const fileName = getFileName(dragPath);
      const newPath = targetPath ? `${targetPath}/${fileName}` : fileName;
      if (newPath !== dragPath) {
        try {
          await api.renameDoc(locale, dragPath, newPath);
          refreshTree();
          navigate(`/docs/${locale}/${newPath}`);
        } catch (e: any) {
          alert(e.message);
        }
      }
    } else {
      // Reorder: move dragPath before/after targetPath in the same level
      const dragParent = getParentDir(dragPath);
      const targetParent = getParentDir(targetPath);

      if (dragParent !== targetParent) {
        // Different parent — move to target's parent folder first
        const fileName = getFileName(dragPath);
        const newPath = targetParent ? `${targetParent}/${fileName}` : fileName;
        if (newPath !== dragPath) {
          try {
            await api.renameDoc(locale, dragPath, newPath);
            // After moving, reorder with the new path
            await reorderInPlace(newPath, targetPath, position);
            refreshTree();
            navigate(`/docs/${locale}/${newPath}`);
          } catch (e: any) {
            alert(e.message);
          }
        }
      } else {
        // Same parent — just reorder
        await reorderInPlace(dragPath, targetPath, position);
        refreshTree();
      }
    }

    setDragPath(null);
    setDropIndicator(null);
  };

  const reorderInPlace = async (itemPath: string, targetPath: string, position: "before" | "after") => {
    // Find the sibling list
    const parent = getParentDir(targetPath);
    const siblings = findSiblings(tree, parent);
    if (!siblings) return;

    const names = siblings.map((n) => n.name);
    const itemName = getFileName(itemPath);
    const targetName = getFileName(targetPath);

    // Remove item from current position
    const filtered = names.filter((n) => n !== itemName);
    // Find target index in filtered list
    const targetIdx = filtered.indexOf(targetName);
    if (targetIdx === -1) return;

    const insertIdx = position === "before" ? targetIdx : targetIdx + 1;
    filtered.splice(insertIdx, 0, itemName);

    // Collect all names across the whole tree for the order file
    const allNames = collectNames(tree);
    // Update the order: put the reordered siblings in their relative positions
    // We just save the full flat name list — backend sorts by name lookup
    const orderList = rewriteOrder(allNames, parent, filtered);

    try {
      await api.reorder(orderList);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleRename = async (oldPath: string, newName: string) => {
    const dir = getParentDir(oldPath);
    const newPath = dir ? `${dir}/${newName}` : newName;
    if (newPath === oldPath) return;
    try {
      const result = await api.renameDoc(locale, oldPath, newPath);
      refreshTree();
      navigate(`/docs/${locale}/${result.new_path}`);
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <nav
      className="sidebar"
      onDragOver={(e) => { if (isAdmin && dragPath) e.preventDefault(); }}
      onDrop={() => {
        if (dragPath && !dropIndicator) {
          // Drop on root = move to root
          const fileName = getFileName(dragPath);
          if (getParentDir(dragPath) !== "") {
            api.renameDoc(locale, dragPath, fileName).then(() => {
              refreshTree();
              navigate(`/docs/${locale}/${fileName}`);
            }).catch((e) => alert(e.message));
          }
        }
        setDragPath(null);
        setDropIndicator(null);
      }}
      onDragEnd={() => { setDragPath(null); setDropIndicator(null); }}
    >
      <ul>
        {tree.map((node) => (
          <TreeNodeView
            key={node.path}
            node={node}
            locale={locale}
            isAdmin={isAdmin}
            dragPath={dragPath}
            dropIndicator={dropIndicator}
            onDragStart={setDragPath}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragLeave={() => setDropIndicator(null)}
            onRename={handleRename}
          />
        ))}
      </ul>
    </nav>
  );
}

function findSiblings(tree: TreeNode[], parentPath: string): TreeNode[] | null {
  if (parentPath === "") return tree;
  const parts = parentPath.split("/");
  let current = tree;
  for (const part of parts) {
    const node = current.find((n) => n.name === part);
    if (!node) return null;
    current = node.children;
  }
  return current;
}

function rewriteOrder(allNames: string[], _parent: string, newSiblingOrder: string[]): string[] {
  // Simple approach: deduplicate allNames, then for the siblings that were reordered,
  // ensure they appear in the new order. Non-sibling names keep their position.
  const seen = new Set<string>();
  const result: string[] = [];

  // First pass: add all non-sibling names in original order
  const siblingSet = new Set(newSiblingOrder);
  let siblingInserted = false;

  for (const name of allNames) {
    if (seen.has(name)) continue;
    seen.add(name);

    if (siblingSet.has(name)) {
      if (!siblingInserted) {
        // Insert all siblings in new order at the position of the first sibling
        for (const s of newSiblingOrder) {
          if (!seen.has(s) || s === name) {
            result.push(s);
          }
        }
        siblingInserted = true;
      }
    } else {
      result.push(name);
    }
  }

  // Add any siblings not yet in result
  for (const s of newSiblingOrder) {
    if (!result.includes(s)) {
      result.push(s);
    }
  }

  return result;
}
