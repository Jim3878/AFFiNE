// NineDay StoryForge: list of playscript tables in this workspace (from db$sf.project), by chapter.
import { Header } from '@affine/core/components/pure/header';
import { useSfProject } from '@affine/core/modules/storyforge/docs';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useService } from '@toeverything/infra';
import { useMemo, useState } from 'react';

import {
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
  WorkbenchLink,
} from '../../../../modules/workbench';
import * as styles from './storyforge.css';

export const StoryForgeHome = () => {
  const workspace = useService(WorkspaceService).workspace;
  const project = useSfProject(workspace);
  const [query, setQuery] = useState('');

  const chapters = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, typeof project.playscripts>();
    for (const p of project.playscripts) {
      if (p.orphan) continue;
      if (q && !p.name.toLowerCase().includes(q)) continue;
      const list = map.get(p.chapter) ?? [];
      list.push(p);
      map.set(p.chapter, list);
    }
    return [...map.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true })
    );
  }, [project, query]);

  return (
    <>
      <ViewTitle title="StoryForge 劇本" />
      <ViewIcon icon="collection" />
      <ViewHeader>
        <Header left={<div className={styles.header}>StoryForge 劇本</div>} />
      </ViewHeader>
      <ViewBody>
        <div className={styles.body}>
          {!project.exists ? (
            <div className={styles.empty}>
              這個 workspace 還沒有 StoryForge 專案。請在本機 StoryForge
              的「雲端同步」分頁按「上傳」。
            </div>
          ) : (
            <>
              <div className={styles.toolbar}>
                <input
                  className={styles.search}
                  placeholder="搜尋劇本名稱…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                <span className={styles.pill}>
                  共 {project.playscripts.length} 份劇本
                </span>
              </div>
              {chapters.map(([chapter, list]) => (
                <div key={chapter}>
                  <div className={styles.chapter}>{chapter}</div>
                  {list.map(p => (
                    <WorkbenchLink
                      key={p.guid}
                      to={`/storyforge/${p.guid}`}
                      className={styles.listItem}
                    >
                      <span>{p.name.slice(p.name.indexOf('/') + 1)}</span>
                    </WorkbenchLink>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      </ViewBody>
    </>
  );
};

export const Component = () => <StoryForgeHome />;
