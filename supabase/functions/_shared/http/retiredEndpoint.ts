const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function retiredEndpointResponse(): Response {
  return new Response(
    JSON.stringify({ success: false, error: 'Endpoint descontinuado.' }),
    {
      status: 410,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
}
