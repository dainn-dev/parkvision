import React from 'react';
import { CreateEditRuleModal } from './rules/CreateEditRuleModal';
import { TenantAccessRule } from '../../types/tenant';

interface CreateAccessRuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  ruleToEdit?: TenantAccessRule | null;
}

export const CreateAccessRuleModal: React.FC<CreateAccessRuleModalProps> = ({
  isOpen,
  onClose,
  ruleToEdit
}) => {
  return (
    <CreateEditRuleModal
      isOpen={isOpen}
      onClose={onClose}
      ruleToEdit={ruleToEdit}
    />
  );
};
