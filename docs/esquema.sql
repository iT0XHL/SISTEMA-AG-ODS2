-- Esquema de NutriRuta AG en PostgreSQL 17.
-- Generado con pg_dump --schema-only a partir de las tablas que crea app/storage/models.py.
-- No existen tablas ni columnas de DNI, personas o beneficiarios.

CREATE TABLE public.center (
    scenario_id character varying(80) NOT NULL,
    center_id character varying(80) NOT NULL,
    name character varying(200) NOT NULL,
    district character varying(120),
    address character varying(250),
    lat double precision,
    lon double precision,
    demand_lots integer NOT NULL,
    priority_weight integer NOT NULL,
    data_origin character varying(20) NOT NULL,
    demand_origin character varying(20) NOT NULL,
    users_aggregate integer,
    CONSTRAINT ck_center_demand CHECK ((demand_lots >= 0)),
    CONSTRAINT ck_center_priority CHECK (((priority_weight >= 1) AND (priority_weight <= 3)))
);
CREATE TABLE public.distance (
    scenario_id character varying(80) NOT NULL,
    from_id character varying(80) NOT NULL,
    to_id character varying(80) NOT NULL,
    km double precision NOT NULL,
    source character varying(120) NOT NULL,
    CONSTRAINT ck_distance_km CHECK ((km >= (0)::double precision))
);
CREATE TABLE public.experiment (
    id character varying(36) NOT NULL,
    scenario_id character varying(80) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    seeds json NOT NULL,
    parameters_json json NOT NULL,
    scenario_hash character varying(64) NOT NULL,
    code_version character varying(60) NOT NULL
);
CREATE TABLE public.generation (
    run_id character varying(36) NOT NULL,
    number integer NOT NULL,
    best_fitness double precision NOT NULL,
    mean_fitness double precision NOT NULL,
    best_j double precision NOT NULL,
    diversity double precision NOT NULL
);
CREATE TABLE public.run (
    id character varying(36) NOT NULL,
    scenario_id character varying(80) NOT NULL,
    experiment_id character varying(36),
    seed integer NOT NULL,
    parameters_json json NOT NULL,
    status character varying(12) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    code_version character varying(60) NOT NULL,
    scenario_hash character varying(64) NOT NULL,
    queue_order integer NOT NULL,
    progress_generation integer NOT NULL,
    cancel_requested boolean NOT NULL,
    stop_reason character varying(30),
    error_code character varying(60),
    error_message text,
    CONSTRAINT ck_run_status CHECK (((status)::text = ANY ((ARRAY['queued'::character varying, 'running'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying])::text[])))
);
CREATE TABLE public.scenario (
    id character varying(80) NOT NULL,
    name character varying(200) NOT NULL,
    origin character varying(20) NOT NULL,
    version character varying(20) NOT NULL,
    hash character varying(64) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    distance_mode character varying(20) NOT NULL,
    distance_source character varying(120),
    depot json NOT NULL,
    inventory_lots integer NOT NULL,
    data_license text,
    notes text,
    priority_criterion text,
    demand_rule json,
    fixture_seed integer,
    CONSTRAINT ck_scenario_inventory CHECK ((inventory_lots >= 0))
);
CREATE TABLE public.solution (
    run_id character varying(36) NOT NULL,
    chromosome_json json NOT NULL,
    decoded_routes_json json NOT NULL,
    metrics_json json NOT NULL,
    validation_json json NOT NULL,
    assignments_json json NOT NULL,
    repair_json json NOT NULL,
    baseline_json json NOT NULL
);
CREATE TABLE public.vehicle (
    scenario_id character varying(80) NOT NULL,
    vehicle_id character varying(80) NOT NULL,
    capacity_lots integer NOT NULL,
    CONSTRAINT ck_vehicle_capacity CHECK ((capacity_lots > 0))
);
ALTER TABLE ONLY public.center
    ADD CONSTRAINT center_pkey PRIMARY KEY (scenario_id, center_id);
ALTER TABLE ONLY public.distance
    ADD CONSTRAINT distance_pkey PRIMARY KEY (scenario_id, from_id, to_id);
ALTER TABLE ONLY public.experiment
    ADD CONSTRAINT experiment_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.generation
    ADD CONSTRAINT generation_pkey PRIMARY KEY (run_id, number);
ALTER TABLE ONLY public.run
    ADD CONSTRAINT run_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.scenario
    ADD CONSTRAINT scenario_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.solution
    ADD CONSTRAINT solution_pkey PRIMARY KEY (run_id);
ALTER TABLE ONLY public.vehicle
    ADD CONSTRAINT vehicle_pkey PRIMARY KEY (scenario_id, vehicle_id);
CREATE INDEX ix_run_queue ON public.run USING btree (status, created_at, queue_order);
CREATE INDEX ix_run_status ON public.run USING btree (status);
CREATE INDEX ix_scenario_hash ON public.scenario USING btree (hash);
ALTER TABLE ONLY public.center
    ADD CONSTRAINT center_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenario(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.distance
    ADD CONSTRAINT distance_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenario(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.experiment
    ADD CONSTRAINT experiment_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenario(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.generation
    ADD CONSTRAINT generation_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.run(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.run
    ADD CONSTRAINT run_experiment_id_fkey FOREIGN KEY (experiment_id) REFERENCES public.experiment(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.run
    ADD CONSTRAINT run_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenario(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.solution
    ADD CONSTRAINT solution_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.run(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.vehicle
    ADD CONSTRAINT vehicle_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenario(id) ON DELETE CASCADE;
