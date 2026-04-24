module one_portrait::registry;

use std::string::{Self as string, String};
use sui::display;
use sui::package;

use one_portrait::kakera::Kakera;

public struct REGISTRY has drop {}

public struct AdminCap has key, store {
    id: UID,
}

public struct Registry has key {
    id: UID,
    unit_ids: vector<ID>,
}

fun init(witness: REGISTRY, ctx: &mut TxContext) {
    let admin_cap = AdminCap { id: object::new(ctx) };
    let registry = Registry {
        id: object::new(ctx),
        unit_ids: vector[],
    };
    let publisher = package::claim(witness, ctx);
    let mut kakera_display = display::new_with_fields<Kakera>(
        &publisher,
        kakera_display_fields(),
        kakera_display_values(),
        ctx,
    );
    display::update_version(&mut kakera_display);

    transfer::transfer(admin_cap, tx_context::sender(ctx));
    transfer::share_object(registry);
    transfer::public_transfer(publisher, tx_context::sender(ctx));
    transfer::public_transfer(kakera_display, tx_context::sender(ctx));
}

fun kakera_display_fields(): vector<String> {
    vector[
        string::utf8(b"name"),
        string::utf8(b"description"),
        string::utf8(b"image_url"),
        string::utf8(b"project_url"),
    ]
}

fun kakera_display_values(): vector<String> {
    vector[
        string::utf8(b"ONE Portrait Kakera #{submission_no}"),
        string::utf8(b"Soulbound proof of participation in ONE Portrait."),
        string::utf8(b"https://one-portrait-web.bububutasan00.workers.dev/demo/demo_mozaiku.png"),
        string::utf8(b"https://one-portrait-web.bububutasan00.workers.dev/"),
    ]
}

public(package) fun record_unit(_admin_cap: &AdminCap, registry: &mut Registry, unit_id: ID) {
    vector::push_back(&mut registry.unit_ids, unit_id);
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(REGISTRY {}, ctx);
}

#[test_only]
public fun unit_count_for_testing(registry: &Registry): u64 {
    vector::length(&registry.unit_ids)
}

#[test_only]
public fun unit_id_for_testing(registry: &Registry, index: u64): ID {
    *vector::borrow(&registry.unit_ids, index)
}
