#[test_only]
module one_portrait::finalize_tests;

use std::unit_test::assert_eq;
use one_portrait::accessors;
use one_portrait::admin_api;
use one_portrait::events::{Self as portrait_events};
use one_portrait::kakera::Kakera;
use one_portrait::master_portrait::{Self as master_portrait, MasterPortrait};
use one_portrait::registry::{Self as registry, AdminCap, Registry};
use one_portrait::unit::{Self, Unit};
use sui::clock::Clock;
use sui::event;
use sui::test_scenario;

#[test]
fun finalize_creates_master_updates_unit_and_emits_mosaic_ready_event() {
    let publisher = @0xA11CE;
    let first_submitter = @0xF21;
    let second_submitter = @0xF22;
    let mosaic_blob_id = b"mosaic-blob";

    let mut scenario = test_scenario::begin(publisher);
    test_scenario::create_system_objects(&mut scenario);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let unit_id = admin_api::create_unit(
        &admin_cap,
        &mut registry,
        b"Demo Athlete Fifteen",
        b"https://example.com/15.png",
        b"target-blob",
        2,
        2,
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(first_submitter);

    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let clock = scenario.take_shared<Clock>();
    accessors::submit_photo(&mut unit, b"photo-1", &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(unit);

    let first_effects = scenario.next_tx(first_submitter);
    assert_eq!(first_effects.num_user_events(), 1);
    let first_kakera = scenario.take_from_sender<Kakera>();
    scenario.return_to_sender(first_kakera);

    scenario.next_tx(second_submitter);

    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let clock = scenario.take_shared<Clock>();
    accessors::submit_photo(&mut unit, b"photo-2", &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(unit);

    let second_effects = scenario.next_tx(second_submitter);
    assert_eq!(second_effects.num_user_events(), 2);
    let second_kakera = scenario.take_from_sender<Kakera>();
    scenario.return_to_sender(second_kakera);

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let placements = vector[
        master_portrait::new_placement_input(b"photo-1", 10, 20, first_submitter, 1),
        master_portrait::new_placement_input(b"photo-2", 30, 40, second_submitter, 2),
    ];

    admin_api::finalize(&admin_cap, &mut unit, mosaic_blob_id, placements, scenario.ctx());

    assert!(unit::is_finalized_for_testing(&unit));
    let master_id = unit::master_id_for_testing(&unit);
    assert_eq!(event::num_events(), 1);

    let mosaic_ready_events = event::events_by_type<portrait_events::MosaicReadyEvent>();
    assert_eq!(mosaic_ready_events.length(), 1);
    let mosaic_ready_event = mosaic_ready_events[0];
    assert_eq!(
        portrait_events::mosaic_ready_event_unit_id_for_testing(&mosaic_ready_event),
        unit_id
    );
    assert_eq!(
        portrait_events::mosaic_ready_event_master_id_for_testing(&mosaic_ready_event),
        master_id
    );
    assert_eq!(
        portrait_events::mosaic_ready_event_mosaic_walrus_blob_id_for_testing(
            &mosaic_ready_event
        ),
        mosaic_blob_id
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(unit);

    let finalize_effects = scenario.next_tx(publisher);
    assert_eq!(finalize_effects.num_user_events(), 1);

    let master = scenario.take_from_sender<MasterPortrait>();
    assert_eq!(object::id(&master), master_id);
    assert_eq!(master_portrait::unit_id_for_testing(&master), unit_id);
    assert_eq!(
        master_portrait::mosaic_walrus_blob_id_for_testing(&master),
        mosaic_blob_id
    );

    let first_placement = master_portrait::placement_for_testing(&master, b"photo-1");
    assert_eq!(master_portrait::placement_x_for_testing(&first_placement), 10);
    assert_eq!(master_portrait::placement_y_for_testing(&first_placement), 20);
    assert_eq!(
        master_portrait::placement_submitter_for_testing(&first_placement),
        first_submitter
    );
    assert_eq!(
        master_portrait::placement_submission_no_for_testing(&first_placement),
        1
    );

    let second_placement = master_portrait::placement_for_testing(&master, b"photo-2");
    assert_eq!(master_portrait::placement_x_for_testing(&second_placement), 30);
    assert_eq!(master_portrait::placement_y_for_testing(&second_placement), 40);
    assert_eq!(
        master_portrait::placement_submitter_for_testing(&second_placement),
        second_submitter
    );
    assert_eq!(
        master_portrait::placement_submission_no_for_testing(&second_placement),
        2
    );
    scenario.return_to_sender(master);

    scenario.next_tx(publisher);

    let unit = scenario.take_shared_by_id<Unit>(unit_id);
    assert!(unit::is_finalized_for_testing(&unit));
    assert_eq!(unit::master_id_for_testing(&unit), master_id);
    test_scenario::return_shared(unit);

    scenario.end();
}

#[test]
fun finalize_zero_submission_demo_unit_with_empty_placements() {
    let publisher = @0xA11CE;
    let mosaic_blob_id = b"mosaic-blob-zero";

    let mut scenario = test_scenario::begin(publisher);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let unit_id = admin_api::create_unit(
        &admin_cap,
        &mut registry,
        b"Demo Athlete Zero",
        b"https://example.com/0.png",
        b"target-blob-zero",
        0,
        2_000,
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    admin_api::finalize(
        &admin_cap,
        &mut unit,
        mosaic_blob_id,
        vector[],
        scenario.ctx(),
    );

    assert!(unit::is_finalized_for_testing(&unit));
    let master_id = unit::master_id_for_testing(&unit);

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(unit);

    let finalize_effects = scenario.next_tx(publisher);
    assert_eq!(finalize_effects.num_user_events(), 1);

    let master = scenario.take_from_sender<MasterPortrait>();
    assert_eq!(object::id(&master), master_id);
    assert_eq!(master_portrait::unit_id_for_testing(&master), unit_id);
    assert_eq!(
        master_portrait::mosaic_walrus_blob_id_for_testing(&master),
        mosaic_blob_id
    );
    scenario.return_to_sender(master);

    scenario.end();
}

#[test, expected_failure(abort_code = unit::EUNIT_NOT_FILLED)]
fun finalize_rejects_pending_unit() {
    let publisher = @0xA11CE;

    let mut scenario = test_scenario::begin(publisher);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let unit_id = admin_api::create_unit(
        &admin_cap,
        &mut registry,
        b"Demo Athlete Sixteen",
        b"https://example.com/16.png",
        b"target-blob",
        2,
        2,
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    admin_api::finalize(
        &admin_cap,
        &mut unit,
        b"mosaic-blob",
        vector[],
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(unit);
    scenario.end();
}

#[test, expected_failure(abort_code = unit::EUNIT_NOT_FILLED)]
fun finalize_rejects_double_finalize() {
    let publisher = @0xA11CE;
    let first_submitter = @0xF31;
    let second_submitter = @0xF32;

    let mut scenario = test_scenario::begin(publisher);
    test_scenario::create_system_objects(&mut scenario);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let unit_id = admin_api::create_unit(
        &admin_cap,
        &mut registry,
        b"Demo Athlete Seventeen",
        b"https://example.com/17.png",
        b"target-blob",
        2,
        2,
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(first_submitter);

    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let clock = scenario.take_shared<Clock>();
    accessors::submit_photo(&mut unit, b"photo-1", &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(unit);

    let first_effects = scenario.next_tx(first_submitter);
    assert_eq!(first_effects.num_user_events(), 1);
    let first_kakera = scenario.take_from_sender<Kakera>();
    scenario.return_to_sender(first_kakera);

    scenario.next_tx(second_submitter);

    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let clock = scenario.take_shared<Clock>();
    accessors::submit_photo(&mut unit, b"photo-2", &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(unit);

    let second_effects = scenario.next_tx(second_submitter);
    assert_eq!(second_effects.num_user_events(), 2);
    let second_kakera = scenario.take_from_sender<Kakera>();
    scenario.return_to_sender(second_kakera);

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    admin_api::finalize(
        &admin_cap,
        &mut unit,
        b"mosaic-blob",
        vector[
            master_portrait::new_placement_input(b"photo-1", 10, 20, first_submitter, 1),
            master_portrait::new_placement_input(b"photo-2", 30, 40, second_submitter, 2),
        ],
        scenario.ctx(),
    );
    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(unit);

    let finalize_effects = scenario.next_tx(publisher);
    assert_eq!(finalize_effects.num_user_events(), 1);
    let master = scenario.take_from_sender<MasterPortrait>();
    scenario.return_to_sender(master);

    scenario.next_tx(publisher);

    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    admin_api::finalize(
        &admin_cap,
        &mut unit,
        b"mosaic-blob-2",
        vector[],
        scenario.ctx(),
    );

    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(unit);
    scenario.end();
}

#[test, expected_failure(abort_code = unit::EINVALID_PLACEMENTS)]
fun finalize_rejects_mismatched_placements() {
    let publisher = @0xA11CE;
    let first_submitter = @0xF51;
    let second_submitter = @0xF52;

    let mut scenario = test_scenario::begin(publisher);
    test_scenario::create_system_objects(&mut scenario);
    registry::init_for_testing(scenario.ctx());

    scenario.next_tx(publisher);
    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut registry = scenario.take_shared<Registry>();
    let unit_id = admin_api::create_unit(
        &admin_cap,
        &mut registry,
        b"Demo Athlete Nineteen",
        b"https://example.com/19.png",
        b"target-blob",
        2,
        2,
        scenario.ctx(),
    );
    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(registry);

    scenario.next_tx(first_submitter);
    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let clock = scenario.take_shared<Clock>();
    accessors::submit_photo(&mut unit, b"photo-1", &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(unit);
    let first_effects = scenario.next_tx(first_submitter);
    assert_eq!(first_effects.num_user_events(), 1);
    let first_kakera = scenario.take_from_sender<Kakera>();
    scenario.return_to_sender(first_kakera);

    scenario.next_tx(second_submitter);
    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    let clock = scenario.take_shared<Clock>();
    accessors::submit_photo(&mut unit, b"photo-2", &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(unit);
    let second_effects = scenario.next_tx(second_submitter);
    assert_eq!(second_effects.num_user_events(), 2);
    let second_kakera = scenario.take_from_sender<Kakera>();
    scenario.return_to_sender(second_kakera);

    scenario.next_tx(publisher);
    let admin_cap = scenario.take_from_sender<AdminCap>();
    let mut unit = scenario.take_shared_by_id<Unit>(unit_id);
    admin_api::finalize(
        &admin_cap,
        &mut unit,
        b"mosaic-blob",
        vector[
            master_portrait::new_placement_input(b"photo-1", 10, 20, second_submitter, 1),
            master_portrait::new_placement_input(b"photo-2", 30, 40, second_submitter, 2),
        ],
        scenario.ctx(),
    );
    scenario.return_to_sender(admin_cap);
    test_scenario::return_shared(unit);
    scenario.end();
}
