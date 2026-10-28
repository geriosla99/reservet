import { HttpError } from '../../shared/http-error.js';
import {
  DuplicateTableNameError,
  tableStatuses,
  type RestaurantTable,
  type TableStatus,
  type createTablesRepository,
} from './tables.repository.js';

type TablesRepository = ReturnType<typeof createTablesRepository>;

const MAX_POSTGRES_INTEGER = 2_147_483_647;

function invalid(message: string): HttpError {
  return new HttpError(400, 'VALIDATION_ERROR', message);
}

function asObject(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw invalid('El cuerpo debe ser un objeto JSON');
  }
  return input as Record<string, unknown>;
}

export function createTablesService(repository: TablesRepository) {
  return {
    list: (): Promise<RestaurantTable[]> => repository.list(),

    async create(input: unknown): Promise<RestaurantTable> {
      const body = asObject(input);
      if (typeof body.name !== 'string') throw invalid('El nombre es obligatorio');
      const name = body.name.trim();
      if (name.length === 0 || name.length > 80) {
        throw invalid('El nombre debe tener entre 1 y 80 caracteres');
      }
      const { capacity } = body;
      if (
        typeof capacity !== 'number' ||
        !Number.isInteger(capacity) ||
        capacity < 1 ||
        capacity > 20
      ) {
        throw invalid('La capacidad debe ser un entero entre 1 y 20');
      }
      try {
        return await repository.create(name, capacity);
      } catch (error) {
        if (error instanceof DuplicateTableNameError) {
          throw new HttpError(409, 'TABLE_NAME_CONFLICT', 'Ya existe una mesa con ese nombre');
        }
        throw error;
      }
    },

    async updateStatus(rawId: string, input: unknown): Promise<RestaurantTable> {
      if (!/^[1-9]\d*$/.test(rawId) || Number(rawId) > MAX_POSTGRES_INTEGER) {
        throw invalid('El id debe ser un entero positivo');
      }
      const { status } = asObject(input);
      if (typeof status !== 'string' || !tableStatuses.includes(status as TableStatus)) {
        throw invalid('Estado inválido');
      }
      const table = await repository.updateStatus(Number(rawId), status as TableStatus);
      if (!table) throw new HttpError(404, 'TABLE_NOT_FOUND', 'Mesa no encontrada');
      return table;
    },
  };
}
