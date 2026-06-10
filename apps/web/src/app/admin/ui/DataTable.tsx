'use client';

import type { ReactNode } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  type SxProps, type Theme,
} from '@mui/material';
import { Label } from './typography';

export interface Column<T> {
  key: string;
  /** Header text/node — rendered inside the standard <Label> atom. */
  header: ReactNode;
  /** Cell content for a given row. */
  render: (row: T) => ReactNode;
  cellSx?: SxProps<Theme>;
  nowrap?: boolean;
  /** Text alignment, applied to both the header and body cells. */
  align?: 'left' | 'right' | 'center';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  /** Per-row sx (e.g. tint failing rows). */
  rowSx?: (row: T) => SxProps<Theme>;
}

/**
 * Thin wrapper over the repeated MUI Table boilerplate
 * (TableContainer/Head/Body/Row/Cell). Each column carries its own header and
 * per-row render, so callers describe data instead of re-typing table markup.
 */
export function DataTable<T>({ columns, rows, getRowKey, onRowClick, rowSx }: DataTableProps<T>) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {columns.map(c => (
              <TableCell key={c.key} align={c.align}><Label>{c.header}</Label></TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow
              key={getRowKey(row, i)}
              hover
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              sx={{ ...(onRowClick ? { cursor: 'pointer' } : {}), ...(rowSx ? (rowSx(row) as Record<string, unknown>) : {}) }}
            >
              {columns.map(c => (
                <TableCell
                  key={c.key}
                  align={c.align}
                  sx={{ ...(c.nowrap ? { whiteSpace: 'nowrap' } : {}), ...(c.cellSx as Record<string, unknown>) }}
                >
                  {c.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
