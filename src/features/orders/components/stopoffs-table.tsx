"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/platform/web/components/ui/table";
import { Badge } from "@/platform/web/components/ui/badge";
import type { Stopoff } from "@/core/types";

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface StopoffsTableProps {
  stopoffs: Stopoff[];
}

export function StopoffsTable({ stopoffs }: StopoffsTableProps) {
  if (stopoffs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No stop-off information.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Address</TableHead>
          <TableHead>City/State</TableHead>
          <TableHead>Zip</TableHead>
          <TableHead>Early Date</TableHead>
          <TableHead>Late Date</TableHead>
          <TableHead>Contact</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stopoffs.map((stop, idx) => (
          <TableRow key={idx}>
            <TableCell>
              <Badge variant="outline">{stop.type}</Badge>
            </TableCell>
            <TableCell className="font-medium">{stop.company_name}</TableCell>
            <TableCell>
              {stop.address_1}
              {stop.address_2 ? `, ${stop.address_2}` : ""}
            </TableCell>
            <TableCell>
              {stop.city}, {stop.state}
            </TableCell>
            <TableCell>{stop.zip}</TableCell>
            <TableCell>{stop.early_date_local ? formatDate(stop.early_date_local) : '—'}</TableCell>
            <TableCell>{stop.late_date_local ? formatDate(stop.late_date_local) : '—'}</TableCell>
            <TableCell>{stop.contact_phone}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
