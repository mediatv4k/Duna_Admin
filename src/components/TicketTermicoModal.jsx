'use client';
import React from 'react';

export default function TicketTermicoModal({ isOpen, onClose, venta, empresa = {} }) {
  if (!isOpen || !venta) return null;

  const handlePrint = () => {
    window.print();
  };

  const fecha = venta.fecha ? new Date(venta.fecha).toLocaleString('es-VE') : new Date().toLocaleString('es-VE');
  const items = venta.items || venta.productos || [];
  const totalUSD = Number(venta.totalUSD || venta.total || 0);
  const tasa = Number(venta.tasa || venta.tasaBCV || 45.50);
  const totalBs = Number(venta.totalBs || (totalUSD * tasa));
  const ticketNro = venta.numeroTicket || venta.id || `FAC-${Math.floor(1000 + Math.random() * 9000)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 print:p-0 print:bg-white print:static">
      {/* Estilos para impresión térmica exacta */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          #ticket-termico-area, #ticket-termico-area * { visibility: visible !important; }
          #ticket-termico-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            margin: 0 !important;
            padding: 4mm !important;
            font-family: monospace !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="bg-white text-black w-full max-w-sm rounded-xl shadow-2xl overflow-hidden print:shadow-none print:w-[80mm] print:max-w-none">
        {/* Acciones superiores (solo pantalla) */}
        <div className="no-print bg-slate-900 text-white px-4 py-3 flex justify-between items-center">
          <span className="text-sm font-semibold flex items-center gap-1.5">
            🖨️ Comprobante de Venta
          </span>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg font-bold">✕</button>
        </div>

        {/* Cuerpo del Ticket Térmico */}
        <div id="ticket-termico-area" className="p-4 text-xs font-mono text-slate-800 bg-white">
          {/* Encabezado */}
          <div className="text-center pb-3 border-b border-dashed border-slate-400">
            <h2 className="text-base font-black tracking-wider uppercase">{empresa.nombre || "D'UNA MARKET"}</h2>
            <p className="text-[11px] text-slate-600">{empresa.sede || "Sede Cabimas, Zulia"}</p>
            <p className="text-[10px] text-slate-500">RIF: {empresa.rif || "J-50123456-7"}</p>
            <p className="text-[10px] text-slate-500">Tel: {empresa.telefono || "0412-1234567"}</p>
          </div>

          {/* Metadata de Venta */}
          <div className="py-2 border-b border-dashed border-slate-400 space-y-0.5 text-[11px]">
            <div className="flex justify-between">
              <span className="font-bold">TICKET:</span>
              <span className="font-bold font-mono">#{ticketNro}</span>
            </div>
            <div className="flex justify-between">
              <span>Fecha:</span>
              <span>{fecha}</span>
            </div>
            <div className="flex justify-between">
              <span>Cliente:</span>
              <span>{venta.cliente?.nombre || 'Consumidor Final'}</span>
            </div>
            {venta.cliente?.cedula && (
              <div className="flex justify-between">
                <span>CI/RIF:</span>
                <span>{venta.cliente.cedula}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Atendido por:</span>
              <span>{venta.cajero || 'Cajero Principal'}</span>
            </div>
          </div>

          {/* Desglose de Productos */}
          <div className="py-2 border-b border-dashed border-slate-400">
            <div className="grid grid-cols-12 font-bold text-[10px] uppercase text-slate-500 pb-1">
              <span className="col-span-6">Descrip.</span>
              <span className="col-span-2 text-center">Cant</span>
              <span className="col-span-4 text-right">Total ($)</span>
            </div>
            <div className="space-y-1">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 text-[11px]">
                  <span className="col-span-6 truncate">{it.nombre || it.descripcion}</span>
                  <span className="col-span-2 text-center">{it.cantidad || 1}</span>
                  <span className="col-span-4 text-right">${Number((it.precio || 0) * (it.cantidad || 1)).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Totales Duales */}
          <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1">
            <div className="flex justify-between text-sm font-bold">
              <span>TOTAL USD:</span>
              <span>${totalUSD.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-slate-600">
              <span>Tasa BCV:</span>
              <span>Bs. {tasa.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-black text-slate-900 border-t border-dotted border-slate-300 pt-1">
              <span>TOTAL BS:</span>
              <span>Bs. {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 pt-0.5">
              <span>Método de Pago:</span>
              <span className="font-semibold uppercase">{venta.metodoPago || 'Efectivo'}</span>
            </div>
          </div>

          {/* Pie de Ticket */}
          <div className="text-center pt-3 space-y-1 text-[10px] text-slate-500">
            <p className="font-semibold">¡Gracias por su compra!</p>
            <p>Conserve este ticket para cualquier cambio o reclamo.</p>
            <p className="text-[9px] text-slate-400">Desarrollado por D'una Group</p>
          </div>
        </div>

        {/* Botones de Acción (solo pantalla) */}
        <div className="no-print p-3 bg-slate-100 border-t flex gap-2">
          <button
            onClick={handlePrint}
            className="flex-1 bg-[#FE6712] hover:bg-[#e0580a] text-white py-2.5 px-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow"
          >
            🖨️ Imprimir Ticket
          </button>
          <button
            onClick={onClose}
            className="bg-slate-300 hover:bg-slate-400 text-slate-800 py-2.5 px-4 rounded-lg font-semibold text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
