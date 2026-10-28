import type { Pool } from 'pg';

export const tableStatuses = ['available', 'occupied', 'out_of_service'] as const;
export type TableStatus = (typeof tableStatuses)[number];

export interface RestaurantTable {
  id: number;
  name: string;
  capacity: number;
  status: TableStatus;
}

// Se lanza cuando PostgreSQL rechaza un nombre repetido (UNIQUE, código 23505).
export class DuplicateTableNameError extends Error {}

const columns = 'id, name, capacity, status';

export function createTablesRepository(db: Pick<Pool, 'query'>) {
  return {
    async list(): Promise<RestaurantTable[]> {
      const result = await db.query<RestaurantTable>(
        `SELECT ${columns} FROM restaurant_tables ORDER BY id`,
      );
      return result.rows;
    },

    async create(name: string, capacity: number): Promise<RestaurantTable> {
      try {
        const result = await db.query<RestaurantTable>(
          `INSERT INTO restaurant_tables (name, capacity) VALUES ($1, $2) RETURNING ${columns}`,
          [name, capacity],
        );
        return result.rows[0]!;
      } catch (error) {
        if ((error as { code?: string }).code === '23505') throw new DuplicateTableNameError();
        throw error;
      }
    },

    async updateStatus(id: number, status: TableStatus): Promise<RestaurantTable | null> {
      const result = await db.query<RestaurantTable>(
        `UPDATE restaurant_tables SET status = $1 WHERE id = $2 RETURNING ${columns}`,
        [status, id],
      );
      return result.rows[0] ?? null;
    },
  };
}
