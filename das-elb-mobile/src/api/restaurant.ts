import { z } from "zod";

import { requestJson } from "./client";
import type { MenuCategory, SubmittedOrder, TableInfo } from "../domain/guest-order";

const tableInfoSchema = z.object({
  table_number: z.string(),
  section_name: z.string(),
  capacity: z.number().int().nonnegative(),
});

const menuItemSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.number().nonnegative(),
  category_id: z.number().int().positive(),
  category_name: z.string(),
  image_url: z.string().nullable(),
  is_available: z.boolean(),
  prep_time_min: z.number().int().nonnegative(),
  allergens: z.array(z.string()),
  dietary_tags: z.array(z.string()),
});

const menuCategorySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  items: z.array(menuItemSchema),
});

const qrMenuResponseSchema = z.object({
  table: tableInfoSchema,
  categories: z.array(menuCategorySchema),
});

const qrOrderResponseSchema = z.object({
  order_id: z.number().int().positive(),
  table_number: z.string(),
  status: z.string(),
  items_count: z.number().int().nonnegative(),
  total: z.number().nonnegative(),
  message: z.string(),
});

export type QrMenuResponse = {
  table: TableInfo;
  categories: MenuCategory[];
};

export type SubmitQrOrderInput = {
  table_code: string;
  guest_name: string;
  items: Array<{
    menu_item_id: number;
    quantity: number;
    notes: string | null;
  }>;
  notes: string | null;
};

export function getQrMenuPath(code: string): string {
  return `/qr/menu/${encodeURIComponent(code)}`;
}

export function getQrOrderPath(): string {
  return "/qr/order";
}

export function getQrOrderStatusPath(orderId: number): string {
  return `/qr/order/${orderId}/status`;
}

export async function fetchMenuForCode(code: string): Promise<QrMenuResponse> {
  const payload = await requestJson<unknown>(getQrMenuPath(code));
  return qrMenuResponseSchema.parse(payload);
}

export async function submitQrOrder(payload: SubmitQrOrderInput): Promise<SubmittedOrder> {
  const response = await requestJson<unknown>(getQrOrderPath(), {
    method: "POST",
    body: payload,
  });
  return qrOrderResponseSchema.parse(response);
}
