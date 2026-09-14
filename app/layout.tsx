import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata={title:'DropLink — private file transfer',description:'Instant browser-to-browser file transfer'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
