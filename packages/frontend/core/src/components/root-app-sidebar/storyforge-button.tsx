// NineDay StoryForge: sidebar entries, shown only in workspaces that have a StoryForge project
// (db$sf.project, created by local StoryForge's first upload).
import { MenuLinkItem } from '@affine/core/modules/app-sidebar/views';
import { useSfProject } from '@affine/core/modules/storyforge/docs';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { EdgelessIcon, ViewLayersIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';

export const StoryForgeButton = () => {
  const workspace = useService(WorkspaceService).workspace;
  const project = useSfProject(workspace);
  const workbench = useService(WorkbenchService).workbench;
  const location = useLiveData(workbench.location$);
  if (!project.exists) return null;
  const onFlow = location.pathname.startsWith('/storyforge/flowgraph');
  return (
    <>
      {project.flowGraphEnabled && (
        <MenuLinkItem
          active={onFlow}
          to={'/storyforge/flowgraph'}
          icon={<EdgelessIcon />}
        >
          StoryForge 流程圖
        </MenuLinkItem>
      )}
      <MenuLinkItem
        active={location.pathname.startsWith('/storyforge') && !onFlow}
        to={'/storyforge'}
        icon={<ViewLayersIcon />}
      >
        StoryForge 劇本
      </MenuLinkItem>
    </>
  );
};
