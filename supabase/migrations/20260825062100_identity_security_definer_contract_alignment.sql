-- Echo Identity — alinhamento explícito com o contrato transversal SECURITY DEFINER.
-- Preserva service_role nas 11 RPCs Identity executáveis por authenticated.

begin;

grant execute on function public.admin_identity_founder_status_v1() to service_role;
grant execute on function public.admin_set_identity_badge_v1(uuid,text,boolean,text,text) to service_role;
grant execute on function public.admin_review_creator_claim_v1(uuid,text,text) to service_role;
grant execute on function public.admin_review_research_contribution_v1(uuid,text,text,boolean) to service_role;
grant execute on function public.admin_set_identity_rollout_v1(boolean,boolean,boolean,boolean,boolean,boolean,text,text) to service_role;

grant execute on function public.echo_set_my_public_identity_v1(text,text,text,text,text,boolean) to service_role;
grant execute on function public.echo_request_creator_verification_v1(text,text) to service_role;
grant execute on function public.echo_submit_research_contribution_v1(text,text,jsonb,uuid,uuid,text,text,text) to service_role;

grant execute on function public.echo_public_identity_cards_v1(uuid[]) to service_role;
grant execute on function public.echo_public_profile_v1(text) to service_role;
grant execute on function public.echo_identity_rollout_status_v1() to service_role;

commit;
