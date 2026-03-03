import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, TreeItem } from "../lib/api";

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

function TreeNodeView({ node, locale }: { node: TreeNode; locale: string }) {
  const { "*": currentPath } = useParams();
  const isActive = currentPath === node.path;
  const isFile = node.children.length === 0;

  if (isFile) {
    return (
      <li>
        <Link
          to={`/docs/${locale}/${node.path}`}
          className={`sidebar-item${isActive ? " active" : ""}`}
        >
          {node.name.replace(/\.md$/, "")}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <span className="sidebar-group">{node.name}</span>
      <ul>
        {node.children.map((child) => (
          <TreeNodeView key={child.path} node={child} locale={locale} />
        ))}
      </ul>
    </li>
  );
}

export function Sidebar({ locale }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([]);

  useEffect(() => {
    api.tree(locale).then((data) => setTree(buildTree(data.items)));
  }, [locale]);

  return (
    <nav className="sidebar">
      <ul>
        {tree.map((node) => (
          <TreeNodeView key={node.path} node={node} locale={locale} />
        ))}
      </ul>
    </nav>
  );
}
