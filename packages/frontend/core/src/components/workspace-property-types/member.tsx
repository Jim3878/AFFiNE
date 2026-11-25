// NineDay: assignable "Member" doc property. The value is a comma separated list of
// workspace user ids, the same encoding the createdBy filter uses.
import { PropertyValue } from '@affine/component';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { MemberSelectorInline } from '../member-selector';
import type { PropertyValueProps } from '../properties/types';
import * as styles from './member.css';

export const parseMemberPropertyValue = (value: unknown): string[] => {
  if (typeof value !== 'string') {
    return [];
  }
  return [
    ...new Set(
      value
        .split(',')
        .map(id => id.trim())
        .filter(Boolean)
    ),
  ];
};

export const MemberValue = ({
  value,
  onChange,
  readonly,
  propertyInfo,
}: PropertyValueProps) => {
  const t = useI18n();
  const workspaceService = useService(WorkspaceService);
  const isCloud = workspaceService.workspace.flavour !== 'local';

  const selected = useMemo(() => parseMemberPropertyValue(value), [value]);

  const handleChange = useCallback(
    (next: string[]) => {
      onChange(next.join(','));
    },
    [onChange]
  );

  if (!isCloud) {
    return (
      <PropertyValue readonly isEmpty={selected.length === 0}>
        <span>{t['com.affine.page-properties.local-user']()}</span>
      </PropertyValue>
    );
  }

  return (
    <PropertyValue
      className={styles.container}
      isEmpty={selected.length === 0}
      readonly={readonly}
      data-testid="property-member-value"
    >
      <MemberSelectorInline
        className={styles.memberInlineEditor}
        placeholder={t[
          'com.affine.page-properties.property-value-placeholder'
        ]()}
        title={propertyInfo?.name ?? undefined}
        selected={selected}
        onChange={handleChange}
        readonly={readonly}
      />
    </PropertyValue>
  );
};
