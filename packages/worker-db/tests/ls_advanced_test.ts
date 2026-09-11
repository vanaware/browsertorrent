import { assert, assertEquals, assertNotEquals, assertThrows, } from '@std/assert';
import { ls, } from '../src/fake/fake-mod.ts';

Deno.test({
  name: 'LS Advanced - Execução de Métodos Modernos de Array JS (query, getSome)',
  fn() {
    const store = ls('LS_FINANCAS_',);
    store.clear();

    store.importLS({
      LS_FINANCAS_f1: { tag: 'work', amount: 150, status: 'paid', code: 'x', },
      LS_FINANCAS_f2: { tag: 'personal', amount: 300, status: 'pending', code: 'y', },
      LS_FINANCAS_f3: { tag: 'work', amount: 500, status: 'paid', code: 'z', },
      LS_FINANCAS_f4: { tag: 'home', amount: 80, status: 'pending', code: 'w', },
      LS_FINANCAS_f5: { tag: 'work', amount: 200, status: 'paid', code: 'k', },
    },);

    // Valida execução de funções avançadas síncronas de Array
    const result = store.query((items: any[],) => {
      return {
        count: items.length, // length
        total: items.reduce((acc: number, i: any,) => acc + i.amount, 0,), // reduce
        firstWork: items.find((i: any,) => i.tag === 'work'), // find
        lastWork: items.findLast((i: any,) => i.tag === 'work'), // findLast
        lastItem: items.at(-1,), // at
        hasPending: items.some((i: any,) => i.status === 'pending'), // some
        allPositive: items.every((i: any,) => i.amount > 0), // every
        tagsHaveHome: items.map((i: any,) => i.tag).includes('home',), // map e includes
        idxPersonal: items.findIndex((i: any,) => i.tag === 'personal'), // findIndex
        lastIdxWork: items.findLastIndex((i: any,) => i.tag === 'work'), // findLastIndex
        indexOfZ: items.map((i: any,) => i.code).indexOf('z',), // indexOf
        paidItems: items.filter((i: any,) => i.status === 'paid'), // filter
        sliced: items.slice(1, 4,), // slice
        sortedByAmount: items.toSorted((a: any, b: any,) => a.amount - b.amount), // toSorted
        reversed: items.toReversed(), // toReversed
        spliced: items.toSpliced(0, 2,), // toSpliced
      };
    },);

    assertEquals(result.count, 5,);
    assertEquals(result.total, 1230,);
    assertEquals((result.firstWork as any).amount, 150,);
    assertEquals((result.lastWork as any).amount, 200,);
    assertEquals((result.lastItem as any).code, 'k',);
    assert(result.hasPending,);
    assert(result.allPositive,);
    assert(result.tagsHaveHome,);
    assertEquals(result.idxPersonal, 1,);
    assertEquals(result.lastIdxWork, 4,);
    assertEquals(result.indexOfZ, 2,);
    assertEquals(result.paidItems.length, 3,);
    assertEquals(result.sliced.length, 3,);
    assertEquals((result.sortedByAmount[0] as any).amount, 80,);
    assertEquals((result.reversed[0] as any).code, 'k',);
    assertEquals(result.spliced.length, 3,);

    store.clear();
  },
},);

Deno.test({
  name: 'LS Advanced - Erros de Tipagem Síncronos (Retornos Inválidos)',
  fn() {
    const store = ls('LS_ERROS_',);
    store.clear();
    store.set('1', { valid: true, },);

    // AssertThrows captura as exceções síncronas disparadas pelo wrapper ls()
    assertThrows(
      () => store.getSome(() => ({ obj: 'invalid', } as any)),
      Error,
      'A função em getSome deve retornar um Array.',
    );

    assertThrows(
      () => store.delSome(() => false as any),
      Error,
      'A função em delSome deve retornar um Array.',
    );

    assertThrows(
      () => store.setSome(() => 'string' as any, (i: any,) => i,),
      Error,
      'A função de seleção em setSome deve retornar um Array.',
    );

    store.clear();
  },
},);

Deno.test({
  name: 'LS Advanced - Transformações de Tipo, Mutação em Massa e Exclusão Segura',
  fn() {
    const store = ls('LS_EMPRESA_',);
    store.clear();

    store.importLS({
      LS_EMPRESA_e10: { name: 'joão silva', department: 'tecnologia', level: 2, active: true, },
      LS_EMPRESA_e20: { name: 'maria souza', department: 'rh', level: 3, active: true, },
      LS_EMPRESA_e30: { name: 'pedro alves', department: 'vendas', level: 1, active: false, },
    },);

    // Atualiza nome para UPPERCASE e converte 'level' (number) para string
    store.setSome(
      (items: any[],) => items.filter((item: any,) => item.active === true),
      (item: any,) => ({
        ...item,
        name: item.name.toUpperCase(),
        department: item.department.toUpperCase(),
        level: String(item.level,), // Mutação de tipo explícita!
      }),
    );

    const e10 = store.get<any>('e10',);
    assertEquals(e10?.name, 'JOÃO SILVA',);
    assertEquals(e10?.department, 'TECNOLOGIA',);
    assertEquals(typeof e10?.level, 'string',);
    assertEquals(e10?.level, '2',);

    const e30 = store.get<any>('e30',);
    assertEquals(e30?.department, 'vendas',); // Permanece em lowercase pois active=false
    assertEquals(typeof e30?.level, 'number',); // Permanece tipo número

    // Exclui funcionários inativos via delSome
    store.delSome((items: any[],) => items.filter((i: any,) => i.active === false));

    // Checa deleção correta
    assertEquals(store.get('e30',), undefined,);
    const remainingKeys = store.keys();
    assertEquals(remainingKeys.length, 2,);

    // Assegura integridade dos que ficaram
    const remaining = store.values<any>();
    assertNotEquals(remaining[0].name, 'pedro alves',);

    store.clear();
  },
},);
