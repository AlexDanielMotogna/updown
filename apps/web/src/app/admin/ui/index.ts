/**
 * Barrel for the admin UI primitives module. Tab refactors in Phase 3
 * import from `@/app/admin/ui`; nothing else should reach into the
 * individual files.
 *
 * See PLAN-ADMIN-REFACTOR.md Phase 2.
 */

// Tokens / constants
export {
  SPORT_COLORS, sportColor,
  CATEGORY_TYPE_COLORS,
  STATUS_PALETTE, type StatusKind,
  LAYOUT_TOKENS,
  POLL_FAST_MS, POLL_MEDIUM_MS, POLL_SLOW_MS, POLL_NONE,
} from './tokens';

// Typography atoms
export { H1, H2, H3, Body, Meta, Label } from './typography';

// Atomic UI
export { StatusChip, type StatusChipProps } from './StatusChip';
export { ActionButton, type ActionButtonProps, type ActionKind } from './ActionButton';
export { RefreshButton, type RefreshButtonProps } from './RefreshButton';
export { LoadingState, type LoadingStateProps } from './LoadingState';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { ErrorAlert, ErrorState, type ErrorAlertProps, type ErrorStateProps } from './ErrorState';
export { SectionCard, type SectionCardProps } from './SectionCard';
export { StatCard, type StatCardProps, type StatTrend } from './StatCard';

// Dialogs
export { AdminDialog, type AdminDialogProps } from './AdminDialog';
export { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';

// Cells / formatters
export { TimeCell, IdCell, WalletCell, formatTime, type TimeCellProps, type TimeMode, type IdCellProps, type WalletCellProps } from './cells';

// Lists
export { FilterBar, type FilterBarProps, type FilterChip } from './FilterBar';
export { DataTable, type Column, type DataTableProps } from './DataTable';
export { Paginator, type PaginatorProps } from './Paginator';

// Toast queue
export {
  ToastProvider, useToast, useMutationFeedback, useToastOnChange,
  type ToastKind, type ToastInput,
} from './Toast';
