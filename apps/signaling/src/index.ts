export default {
  async fetch(): Promise<Response> {
    return new Response('loudbooks-signaling', { status: 200 })
  },
} satisfies ExportedHandler
