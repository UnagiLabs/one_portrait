module one_portrait::registry;

public struct REGISTRY has drop {}

public struct AdminCap has key, store {
    id: UID,
}

public struct Registry has key {
    id: UID,
    unit_ids: vector<ID>,
}

fun init(_witness: REGISTRY, ctx: &mut TxContext) {
    let admin_cap = AdminCap { id: object::new(ctx) };
    let registry = Registry {
        id: object::new(ctx),
        unit_ids: vector[],
    };

    transfer::transfer(admin_cap, tx_context::sender(ctx));
    transfer::share_object(registry);
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
