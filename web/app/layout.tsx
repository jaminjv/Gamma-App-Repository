import './globals.css';

export const metadata = {
  title: 'Ramaje — Panel de operaciones',
  description: 'Gestión de órdenes de trabajo, cuadrillas y vaciados.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
