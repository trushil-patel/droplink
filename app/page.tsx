'use client';
import { useState } from 'react';
import DropLinkApp from '../components/droplink-app';
import FullHome from '../components/full-home';
export default function Page(){const [transfer,setTransfer]=useState(false);return transfer?<DropLinkApp/>:<FullHome onSend={()=>setTransfer(true)} onReceive={()=>setTransfer(true)}/>}
