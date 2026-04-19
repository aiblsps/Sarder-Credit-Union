import React from 'react';

interface Column<T> {
  header: string;
  accessor?: keyof T;
  render?: (item: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  className?: string;
  renderFooter?: () => React.ReactNode;
}

export function DataTable<T>({ 
  columns, 
  data, 
  keyExtractor, 
  emptyMessage = "কোন তথ্য পাওয়া যায়নি", 
  onRowClick,
  className,
  renderFooter
}: DataTableProps<T>) {
  return (
    <div className={`w-full bg-white border-t border-b border-black ${className || 'mb-16'}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-max border border-black">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#003366] text-white">
              {columns.map((column, index) => (
                <th 
                  key={index} 
                  className={`py-1 px-4 text-sm font-bold border border-black whitespace-nowrap ${column.headerClassName || ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black">
            {data.length > 0 ? (
              data.map((item, index) => (
                <tr 
                  key={keyExtractor(item)} 
                  onClick={() => onRowClick?.(item)}
                  className={`hover:bg-slate-100 transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${index % 2 === 0 ? "bg-white" : "bg-slate-50"}`}
                >
                  {columns.map((column, colIndex) => (
                    <td 
                      key={colIndex} 
                      className={`py-1 px-4 text-sm border border-black ${column.className || ''}`}
                    >
                      {column.render 
                        ? column.render(item, index) 
                        : column.accessor 
                          ? (item[column.accessor] as React.ReactNode) 
                          : null
                      }
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="p-12 text-center text-slate-400 font-bold">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
          {renderFooter && (
            <tfoot className="bg-slate-50 font-bold border-t-2 border-black">
              {renderFooter()}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
