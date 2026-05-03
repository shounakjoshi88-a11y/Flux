import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    "https://leapsqstikvxtkyjrrcl.supabase.co",
    "sb_publishable_WzgnXsJraijBMDxRzf-f0Q_3CEfAZ3B"
  )
}
